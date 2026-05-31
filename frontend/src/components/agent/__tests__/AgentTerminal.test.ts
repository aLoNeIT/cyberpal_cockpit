import { mount, flushPromises } from '@vue/test-utils';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import AgentTerminal from '../AgentTerminal.vue';

const writeMock = vi.fn();
const openMock = vi.fn();
const disposeMock = vi.fn();
const scrollToBottomMock = vi.fn();
const fitMock = vi.fn();
const resizeObservers: ResizeObserverMock[] = [];
const mutationObservers: MutationObserverMock[] = [];

vi.mock('xterm', () => ({
  Terminal: vi.fn().mockImplementation(() => ({
    write: writeMock,
    open: openMock,
    dispose: disposeMock,
    scrollToBottom: scrollToBottomMock,
    loadAddon: vi.fn(),
    options: {},
  })),
}));

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn().mockImplementation(() => ({
    fit: fitMock,
  })),
}));

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: vi.fn().mockImplementation(() => ({})),
}));

class ResizeObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();

  constructor() {
    resizeObservers.push(this);
  }
}

class MutationObserverMock {
  observe = vi.fn();
  disconnect = vi.fn();

  constructor() {
    mutationObservers.push(this);
  }
}

describe('AgentTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resizeObservers.length = 0;
    mutationObservers.length = 0;
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
    vi.stubGlobal('MutationObserver', MutationObserverMock);
    document.documentElement.setAttribute('data-theme', 'dark');
  });

  it('normalizes LF-only output to CRLF before writing to xterm', async () => {
    const wrapper = mount(AgentTerminal, {
      props: {
        output: 'first line\nsecond line',
      },
    });
    await flushPromises();

    expect(writeMock).toHaveBeenCalledWith('first line\r\nsecond line');

    await wrapper.setProps({
      output: 'first line\nsecond line\nthird line',
    });

    expect(writeMock).toHaveBeenLastCalledWith('\r\nthird line');
  });

  it('keeps existing CRLF output unchanged', async () => {
    mount(AgentTerminal, {
      props: {
        output: 'already\r\nnormalized',
      },
    });
    await flushPromises();

    expect(writeMock).toHaveBeenCalledWith('already\r\nnormalized');
  });

  it('disposes terminal resources on unmount', async () => {
    const wrapper = mount(AgentTerminal, {
      props: {
        output: 'output',
      },
    });
    await flushPromises();

    wrapper.unmount();

    expect(resizeObservers[0].disconnect).toHaveBeenCalled();
    expect(mutationObservers[0].disconnect).toHaveBeenCalled();
    expect(disposeMock).toHaveBeenCalled();
  });
});
