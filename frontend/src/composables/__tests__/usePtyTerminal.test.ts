import { describe, it, expect, beforeEach, vi } from 'vitest';
import { usePtyTerminal } from '../usePtyTerminal';
import type { WSMessage } from '@/types';

const wsClient = {
  connect: vi.fn(),
  send: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  onConnectionChange: vi.fn(),
};

vi.mock('@/services/ws', () => ({
  getWSClient: vi.fn(() => wsClient),
}));

function handlersFor(type: string): Array<(message: WSMessage) => void> {
  return wsClient.on.mock.calls
    .filter((call) => call[0] === type)
    .map((call) => call[1]);
}

function emit(type: string, payload: unknown): void {
  for (const handler of handlersFor(type)) {
    handler({ type, payload, timestamp: Date.now() });
  }
}

describe('usePtyTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    wsClient.onConnectionChange.mockReturnValue(vi.fn());
  });

  it('connects and sends terminal:create when starting', () => {
    const pty = usePtyTerminal();

    pty.start({ cwd: 'E:\\Work\\Web\\cyberpal_cockpit', cols: 100, rows: 30 });

    expect(wsClient.connect).toHaveBeenCalled();
    expect(wsClient.send).toHaveBeenCalledWith({
      type: 'terminal:create',
      payload: { cwd: 'E:\\Work\\Web\\cyberpal_cockpit', cols: 100, rows: 30 },
    });
    expect(pty.status.value).toBe('connecting');
  });

  it('tracks session state and writes terminal data through callbacks', () => {
    const onData = vi.fn();
    const onCwd = vi.fn();
    const pty = usePtyTerminal({ onData, onCwd });
    pty.start({ cols: 80, rows: 24 });

    emit('terminal:created', {
      sessionId: 'session-1',
      cwd: 'E:\\Work\\Web',
      shell: 'powershell.exe',
      pid: 1234,
    });
    emit('terminal:data', { sessionId: 'session-1', data: 'hello' });
    emit('terminal:cwd', { sessionId: 'session-1', cwd: 'E:\\Work\\Web\\backend' });

    expect(pty.sessionId.value).toBe('session-1');
    expect(pty.cwd.value).toBe('E:\\Work\\Web\\backend');
    expect(pty.status.value).toBe('running');
    expect(onData).toHaveBeenCalledWith('hello');
    expect(onCwd).toHaveBeenCalledWith('E:\\Work\\Web\\backend');
  });

  it('sends input, resize, cwd request, and kill for the current session', () => {
    const pty = usePtyTerminal();
    pty.start({ cols: 80, rows: 24 });
    emit('terminal:created', { sessionId: 'session-1', cwd: 'E:\\Work', shell: 'cmd.exe', pid: 1 });
    wsClient.send.mockClear();

    pty.sendInput('node -v\r');
    pty.resize(120, 40);
    pty.requestCwd();
    pty.kill();

    expect(wsClient.send.mock.calls.map((call) => call[0])).toEqual([
      { type: 'terminal:input', payload: { sessionId: 'session-1', data: 'node -v\r' } },
      { type: 'terminal:resize', payload: { sessionId: 'session-1', cols: 120, rows: 40 } },
      { type: 'terminal:cwd-request', payload: { sessionId: 'session-1' } },
      { type: 'terminal:kill', payload: { sessionId: 'session-1' } },
    ]);
  });

  it('kills the current session before restarting', () => {
    const pty = usePtyTerminal();
    pty.start({ cols: 80, rows: 24 });
    emit('terminal:created', { sessionId: 'session-1', cwd: 'E:\\Work', shell: 'cmd.exe', pid: 1 });
    wsClient.send.mockClear();

    pty.restart({ cwd: 'E:\\Work\\Web', cols: 100, rows: 30 });

    expect(wsClient.send.mock.calls.map((call) => call[0])).toEqual([
      { type: 'terminal:kill', payload: { sessionId: 'session-1' } },
      { type: 'terminal:create', payload: { cwd: 'E:\\Work\\Web', cols: 100, rows: 30 } },
    ]);
    expect(pty.status.value).toBe('connecting');
  });

  it('updates status for exit and error, and unregisters handlers on dispose', () => {
    const pty = usePtyTerminal();
    pty.start({ cols: 80, rows: 24 });
    emit('terminal:created', { sessionId: 'session-1', cwd: 'E:\\Work', shell: 'cmd.exe', pid: 1 });

    emit('terminal:exit', { sessionId: 'session-1', exitCode: 0 });
    expect(pty.status.value).toBe('exited');
    expect(pty.sessionId.value).toBeNull();

    emit('terminal:error', { message: 'failed' });
    expect(pty.status.value).toBe('error');
    expect(pty.error.value).toBe('failed');

    pty.dispose();

    expect(wsClient.off).toHaveBeenCalledWith('terminal:created', expect.any(Function));
    expect(wsClient.off).toHaveBeenCalledWith('terminal:data', expect.any(Function));
    expect(wsClient.off).toHaveBeenCalledWith('terminal:cwd', expect.any(Function));
    expect(wsClient.off).toHaveBeenCalledWith('terminal:exit', expect.any(Function));
    expect(wsClient.off).toHaveBeenCalledWith('terminal:error', expect.any(Function));
  });

  it('recreates the terminal session after WebSocket reconnects', () => {
    const unsubscribeConnection = vi.fn();
    wsClient.onConnectionChange.mockReturnValue(unsubscribeConnection);
    const pty = usePtyTerminal();
    pty.start({ cwd: 'E:\\Work', cols: 80, rows: 24 });
    emit('terminal:created', { sessionId: 'session-1', cwd: 'E:\\Work', shell: 'cmd.exe', pid: 1 });
    wsClient.send.mockClear();

    const connectionHandler = wsClient.onConnectionChange.mock.calls[0][0];
    connectionHandler({ status: 'disconnected', reason: 'heartbeat-timeout' });
    connectionHandler({ status: 'reconnecting', attempt: 1, delay: 1000 });

    expect(pty.status.value).toBe('reconnecting');
    expect(pty.sessionId.value).toBeNull();
    expect(pty.error.value).toBe('WebSocket disconnected. Reconnecting terminal session...');

    connectionHandler({ status: 'connected' });

    expect(pty.status.value).toBe('connecting');
    expect(pty.error.value).toBeNull();
    expect(wsClient.send).toHaveBeenCalledWith({
      type: 'terminal:create',
      payload: { cwd: 'E:\\Work', cols: 80, rows: 24 },
    });

    pty.dispose();
    expect(unsubscribeConnection).toHaveBeenCalledTimes(1);
  });
});
