import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import TerminalDemoPage from '../TerminalDemoPage.vue';

const {
  fetchTerminalFileListMock,
  ptyState,
  terminalInstance,
  fitAddon,
  state,
} = vi.hoisted(() => {
  const localPtyState: any = {
    sessionId: { value: 'session-1' },
    cwd: { value: 'E:\\Work\\Web\\cyberpal_cockpit' },
    status: { value: 'running' },
    error: { value: null },
    start: vi.fn(),
    sendInput: vi.fn(),
    resize: vi.fn(),
    requestCwd: vi.fn(),
    restart: vi.fn(),
    kill: vi.fn(),
    dispose: vi.fn(),
  };
  localPtyState.isRunning = {
    get value() {
      return localPtyState.status.value === 'running';
    },
  };

  return {
    fetchTerminalFileListMock: vi.fn(),
    ptyState: localPtyState,
    terminalInstance: {
      write: vi.fn(),
      open: vi.fn(),
      dispose: vi.fn(),
      loadAddon: vi.fn(),
      onData: vi.fn(),
      cols: 100,
      rows: 30,
      options: {},
    },
    fitAddon: {
      fit: vi.fn(),
    },
    state: {
      ptyOptions: null as { onData?: (data: string) => void; onCwd?: (cwd: string) => void } | null,
    },
  };
});

vi.mock('@/services/api', () => ({
  fetchTerminalFileList: fetchTerminalFileListMock,
}));

vi.mock('@/composables/usePtyTerminal', () => ({
  usePtyTerminal: vi.fn((options) => {
    state.ptyOptions = options;
    return ptyState;
  }),
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(() => terminalInstance),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn(() => fitAddon),
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn(() => ({})),
}));

vi.mock('@xterm/xterm/css/xterm.css', () => ({}));

class ResizeObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();
}

function pathKey(path: string): string {
  return encodeURIComponent(path);
}

function findByTestId(wrapper: ReturnType<typeof mount>, testId: string) {
  return wrapper.findAll('[data-testid]').find((node) => node.attributes('data-testid') === testId);
}

describe('TerminalDemoPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    ptyState.sessionId.value = 'session-1';
    ptyState.cwd.value = 'E:\\Work\\Web\\cyberpal_cockpit';
    ptyState.status.value = 'running';
    ptyState.error.value = null;
    state.ptyOptions = null;
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    fetchTerminalFileListMock.mockResolvedValue({
      path: 'E:\\Work\\Web\\cyberpal_cockpit',
      parentPath: 'E:\\Work\\Web',
      entries: [
        {
          name: 'backend',
          path: 'E:\\Work\\Web\\cyberpal_cockpit\\backend',
          type: 'directory',
          size: 0,
          modifiedAt: 1,
          hasChildren: true,
          children: [
            {
              name: 'src',
              path: 'E:\\Work\\Web\\cyberpal_cockpit\\backend\\src',
              type: 'directory',
              size: 0,
              modifiedAt: 1,
              hasChildren: false,
              children: [],
            },
            {
              name: 'package.json',
              path: 'E:\\Work\\Web\\cyberpal_cockpit\\backend\\package.json',
              type: 'file',
              size: 1024,
              modifiedAt: 1,
            },
          ],
        },
        { name: 'README.md', path: 'E:\\Work\\Web\\cyberpal_cockpit\\README.md', type: 'file', size: 2048, modifiedAt: 2 },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the file list and mounts the terminal', async () => {
    const wrapper = mount(TerminalDemoPage);
    await flushPromises();

    expect(wrapper.text()).toContain('Xterm PTY Demo');
    expect(wrapper.text()).toContain('backend');
    expect(wrapper.text()).toContain('README.md');
    expect(wrapper.find('[data-testid="terminal-mount"]').exists()).toBe(true);
    expect(terminalInstance.open).toHaveBeenCalled();
    expect(ptyState.start).toHaveBeenCalledWith({
      cwd: expect.any(String),
      cols: 100,
      rows: 30,
    });
  });

  it('refreshes the file list when the terminal cwd changes', async () => {
    mount(TerminalDemoPage);
    await flushPromises();
    fetchTerminalFileListMock.mockClear();

    state.ptyOptions?.onCwd?.('E:\\Work\\Web\\cyberpal_cockpit\\backend');
    await flushPromises();

    expect(fetchTerminalFileListMock).toHaveBeenCalledWith('E:\\Work\\Web\\cyberpal_cockpit\\backend');
  });

  it('wires terminal input and toolbar actions to the composable', async () => {
    const wrapper = mount(TerminalDemoPage);
    await flushPromises();

    terminalInstance.onData.mock.calls[0][0]('node -v\r');
    await wrapper.find('[data-testid="refresh-terminal"]').trigger('click');
    await wrapper.find('[data-testid="restart-terminal"]').trigger('click');
    await wrapper.find('[data-testid="stop-terminal"]').trigger('click');

    expect(ptyState.sendInput).toHaveBeenCalledWith('node -v\r');
    expect(ptyState.requestCwd).toHaveBeenCalled();
    expect(ptyState.restart).toHaveBeenCalledWith({
      cwd: 'E:\\Work\\Web\\cyberpal_cockpit',
      cols: 100,
      rows: 30,
    });
    expect(ptyState.kill).toHaveBeenCalled();
  });

  it('sends directory-changing commands without requesting cwd from the frontend', async () => {
    mount(TerminalDemoPage);
    await flushPromises();
    ptyState.requestCwd.mockClear();

    terminalInstance.onData.mock.calls[0][0]('node -v\r');
    terminalInstance.onData.mock.calls[0][0]('cd backend\r');

    expect(ptyState.sendInput).toHaveBeenCalledWith('node -v\r');
    expect(ptyState.sendInput).toHaveBeenCalledWith('cd backend\r');
    expect(ptyState.requestCwd).not.toHaveBeenCalled();
  });

  it('updates the file panel path when clicking a directory without sending terminal input', async () => {
    const wrapper = mount(TerminalDemoPage);
    await flushPromises();
    fetchTerminalFileListMock.mockClear();

    await findByTestId(wrapper, `toggle-${pathKey('E:\\Work\\Web\\cyberpal_cockpit\\backend')}`)?.trigger('click');

    expect(wrapper.text()).toContain('src');
    expect(wrapper.text()).toContain('package.json');
    expect(ptyState.sendInput).not.toHaveBeenCalled();
    expect(fetchTerminalFileListMock).not.toHaveBeenCalled();
  });

  it('renders directory and file icons in a tree', async () => {
    const wrapper = mount(TerminalDemoPage);
    await flushPromises();

    expect(findByTestId(wrapper, `icon-folder-${pathKey('E:\\Work\\Web\\cyberpal_cockpit\\backend')}`)?.exists()).toBe(true);
    expect(findByTestId(wrapper, `icon-file-${pathKey('E:\\Work\\Web\\cyberpal_cockpit\\README.md')}`)?.exists()).toBe(true);

    await findByTestId(wrapper, `toggle-${pathKey('E:\\Work\\Web\\cyberpal_cockpit\\backend')}`)?.trigger('click');

    expect(findByTestId(wrapper, `tree-item-${pathKey('E:\\Work\\Web\\cyberpal_cockpit\\backend\\src')}`)?.exists()).toBe(true);
  });

  it('expands nested directories recursively', async () => {
    fetchTerminalFileListMock.mockResolvedValueOnce({
      path: 'E:\\Work\\Web\\cyberpal_cockpit',
      parentPath: 'E:\\Work\\Web',
      entries: [
        {
          name: 'backend',
          path: 'E:\\Work\\Web\\cyberpal_cockpit\\backend',
          type: 'directory',
          size: 0,
          modifiedAt: 1,
          hasChildren: true,
          children: [
            {
              name: 'src',
              path: 'E:\\Work\\Web\\cyberpal_cockpit\\backend\\src',
              type: 'directory',
              size: 0,
              modifiedAt: 1,
              hasChildren: true,
            },
          ],
        },
      ],
    });
    const wrapper = mount(TerminalDemoPage);
    await flushPromises();
    fetchTerminalFileListMock.mockClear();

    fetchTerminalFileListMock.mockImplementation(async (dirPath: string) => {
      if (dirPath === 'E:\\Work\\Web\\cyberpal_cockpit\\backend\\src') {
        return {
          path: dirPath,
          parentPath: 'E:\\Work\\Web\\cyberpal_cockpit\\backend',
          entries: [
            {
              name: 'routes',
              path: 'E:\\Work\\Web\\cyberpal_cockpit\\backend\\src\\routes',
              type: 'directory',
              size: 0,
              modifiedAt: 3,
              hasChildren: false,
              children: [],
            },
          ],
        };
      }

      return {
        path: dirPath,
        parentPath: 'E:\\Work\\Web\\cyberpal_cockpit',
        entries: [],
      };
    });

    await findByTestId(wrapper, `toggle-${pathKey('E:\\Work\\Web\\cyberpal_cockpit\\backend')}`)?.trigger('click');
    await findByTestId(wrapper, `toggle-${pathKey('E:\\Work\\Web\\cyberpal_cockpit\\backend\\src')}`)?.trigger('click');
    await flushPromises();

    expect(fetchTerminalFileListMock).toHaveBeenCalledWith('E:\\Work\\Web\\cyberpal_cockpit\\backend\\src');
    expect(findByTestId(wrapper, `tree-item-${pathKey('E:\\Work\\Web\\cyberpal_cockpit\\backend\\src\\routes')}`)?.exists()).toBe(true);
  });

  it('shows terminal connection errors to the user', async () => {
    ptyState.status.value = 'reconnecting';
    ptyState.error.value = 'WebSocket disconnected. Reconnecting terminal session...';

    const wrapper = mount(TerminalDemoPage);
    await flushPromises();

    expect(wrapper.text()).toContain('WebSocket disconnected. Reconnecting terminal session...');
    expect(wrapper.text()).toContain('Reconnecting');
  });
});
