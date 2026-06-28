import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { WSMessage } from '../../types/index.js';
import type { TerminalSessionService } from '../../services/TerminalSessionService.js';

vi.mock('ws', () => ({
  WebSocket: {
    OPEN: 1,
    CLOSED: 3,
  },
}));

vi.mock('../../config.js', () => ({
  CONFIG: {
    wsHeartbeatInterval: 30000,
  },
}));

import { WsHandler } from '../WsHandler.js';

type MockWs = EventEmitter & {
  readyState: number;
  send: ReturnType<typeof vi.fn>;
};

function createMockWs(): MockWs {
  const ws = new EventEmitter() as MockWs;
  ws.readyState = 1;
  ws.send = vi.fn();
  return ws;
}

function createMockTerminalService(): TerminalSessionService {
  return {
    onData: null,
    onCwd: null,
    onExit: null,
    onError: null,
    createSession: vi.fn(() => ({
      id: 'terminal-1',
      cwd: 'E:\\Work\\Web\\cyberpal_cockpit',
      shell: 'powershell.exe',
      pid: 1234,
    })),
    write: vi.fn(),
    resize: vi.fn(),
    requestCwd: vi.fn(),
    kill: vi.fn(),
    killAll: vi.fn(),
  } as unknown as TerminalSessionService;
}

function emitMessage(ws: EventEmitter, message: Partial<WSMessage> & { type: string }) {
  ws.emit('message', Buffer.from(JSON.stringify({
    payload: {},
    timestamp: Date.now(),
    ...message,
  })));
}

function sentMessages(ws: { send: ReturnType<typeof vi.fn> }): WSMessage[] {
  return ws.send.mock.calls.map((call) => JSON.parse(call[0]) as WSMessage);
}

describe('WsHandler terminal protocol', () => {
  let terminalService: TerminalSessionService;
  let handler: WsHandler;

  beforeEach(() => {
    vi.useFakeTimers();
    terminalService = createMockTerminalService();
    handler = new WsHandler({} as any, terminalService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('creates a terminal session and sends terminal:created to the owning socket', () => {
    const ws = createMockWs();
    handler.handleConnection(ws as any);
    ws.send.mockClear();

    emitMessage(ws, {
      type: 'terminal:create',
      payload: { cwd: 'E:\\Work\\Web\\cyberpal_cockpit', cols: 100, rows: 32 },
    });

    expect(terminalService.createSession).toHaveBeenCalledWith({
      cwd: 'E:\\Work\\Web\\cyberpal_cockpit',
      cols: 100,
      rows: 32,
    });
    expect(sentMessages(ws)[0]).toMatchObject({
      type: 'terminal:created',
      payload: {
        sessionId: 'terminal-1',
        cwd: 'E:\\Work\\Web\\cyberpal_cockpit',
        shell: 'powershell.exe',
        pid: 1234,
      },
    });
  });

  it('routes terminal data, cwd, and exit events only to the owning socket', () => {
    const owner = createMockWs();
    const other = createMockWs();
    handler.handleConnection(owner as any);
    handler.handleConnection(other as any);
    owner.send.mockClear();
    other.send.mockClear();

    emitMessage(owner, {
      type: 'terminal:create',
      payload: { cols: 80, rows: 24 },
    });
    owner.send.mockClear();

    terminalService.onData?.('terminal-1', 'hello');
    terminalService.onCwd?.('terminal-1', 'E:\\Work\\Web');
    terminalService.onExit?.('terminal-1', 0);

    expect(sentMessages(owner).map((message) => message.type)).toEqual([
      'terminal:data',
      'terminal:cwd',
      'terminal:exit',
    ]);
    expect(other.send).not.toHaveBeenCalled();
  });

  it('accepts input, resize, cwd request, and kill only from the owner', () => {
    const owner = createMockWs();
    const other = createMockWs();
    handler.handleConnection(owner as any);
    handler.handleConnection(other as any);

    emitMessage(owner, {
      type: 'terminal:create',
      payload: { cols: 80, rows: 24 },
    });

    emitMessage(other, { type: 'terminal:input', payload: { sessionId: 'terminal-1', data: 'bad' } });
    emitMessage(owner, { type: 'terminal:input', payload: { sessionId: 'terminal-1', data: 'ok' } });
    emitMessage(owner, { type: 'terminal:resize', payload: { sessionId: 'terminal-1', cols: 120, rows: 30 } });
    emitMessage(owner, { type: 'terminal:cwd-request', payload: { sessionId: 'terminal-1' } });
    emitMessage(owner, { type: 'terminal:kill', payload: { sessionId: 'terminal-1' } });

    expect(terminalService.write).toHaveBeenCalledTimes(1);
    expect(terminalService.write).toHaveBeenCalledWith('terminal-1', 'ok');
    expect(terminalService.resize).toHaveBeenCalledWith('terminal-1', 120, 30);
    expect(terminalService.requestCwd).toHaveBeenCalledWith('terminal-1');
    expect(terminalService.kill).toHaveBeenCalledWith('terminal-1');
  });

  it('kills terminal sessions owned by a socket when it closes', () => {
    const ws = createMockWs();
    handler.handleConnection(ws as any);

    emitMessage(ws, {
      type: 'terminal:create',
      payload: { cols: 80, rows: 24 },
    });
    ws.emit('close');

    expect(terminalService.killAll).toHaveBeenCalledWith(['terminal-1']);
  });
});
