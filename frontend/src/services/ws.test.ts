import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WSClient } from './ws';

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;

  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: Event) => void) | null = null;

  constructor(public url: string) {}

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

describe('WSClient', () => {
  let sockets: MockWebSocket[];

  beforeEach(() => {
    vi.useFakeTimers();
    sockets = [];
    vi.stubGlobal('WebSocket', class extends MockWebSocket {
      constructor(url: string) {
        super(url);
        sockets.push(this);
      }
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('queues messages sent while connecting and flushes them after open', () => {
    const client = new WSClient('ws://localhost/ws');
    client.connect();

    client.send({ type: 'terminal:create', payload: { cols: 80, rows: 24 } });

    expect(sockets[0].sent).toEqual([]);

    sockets[0].readyState = MockWebSocket.OPEN;
    sockets[0].onopen?.();

    expect(sockets[0].sent).toHaveLength(1);
    expect(JSON.parse(sockets[0].sent[0])).toMatchObject({
      type: 'terminal:create',
      payload: { cols: 80, rows: 24 },
    });
  });

  it('sends immediately when the socket is already open', () => {
    const client = new WSClient('ws://localhost/ws');
    client.connect();
    sockets[0].readyState = MockWebSocket.OPEN;
    sockets[0].onopen?.();

    client.send({ type: 'terminal:input', payload: { sessionId: 's1', data: 'pwd\r' } });

    expect(sockets[0].sent).toHaveLength(1);
    expect(JSON.parse(sockets[0].sent[0])).toMatchObject({
      type: 'terminal:input',
      payload: { sessionId: 's1', data: 'pwd\r' },
    });
  });

  it('keeps the connection alive when server ping heartbeats arrive', () => {
    const client = new WSClient('ws://localhost/ws');
    client.connect();
    sockets[0].readyState = MockWebSocket.OPEN;
    sockets[0].onopen?.();
    const closeSpy = vi.spyOn(sockets[0], 'close');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    vi.advanceTimersByTime(30000);
    sockets[0].onmessage?.({
      data: JSON.stringify({ type: 'ping', payload: {}, timestamp: Date.now() }),
    } as MessageEvent);

    expect(JSON.parse(sockets[0].sent[0])).toMatchObject({ type: 'pong' });

    vi.advanceTimersByTime(30000);
    expect(closeSpy).not.toHaveBeenCalled();

    vi.advanceTimersByTime(30000);
    expect(closeSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith('[WSClient] Heartbeat timeout, reconnecting...');

    warnSpy.mockRestore();
  });

  it('notifies connection listeners without replacing legacy callbacks', () => {
    const client = new WSClient('ws://localhost/ws');
    const listener = vi.fn();
    const legacyConnected = vi.fn();
    const legacyDisconnected = vi.fn();
    const legacyError = vi.fn();

    client.onConnected = legacyConnected;
    client.onDisconnected = legacyDisconnected;
    client.onError = legacyError;
    const unsubscribe = client.onConnectionChange(listener);

    client.connect();
    sockets[0].readyState = MockWebSocket.OPEN;
    sockets[0].onopen?.();

    expect(legacyConnected).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ status: 'connected' });

    const error = new Event('error');
    sockets[0].onerror?.(error);
    expect(legacyError).toHaveBeenCalledWith(error);
    expect(listener).toHaveBeenCalledWith({ status: 'error', error });

    sockets[0].close();
    expect(legacyDisconnected).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ status: 'disconnected', reason: 'closed' });

    unsubscribe();
    listener.mockClear();

    client.disconnect();
    expect(listener).not.toHaveBeenCalled();
  });

  it('notifies reconnecting and opens a new socket after an unintentional close', () => {
    const client = new WSClient('ws://localhost/ws');
    const listener = vi.fn();
    client.onConnectionChange(listener);

    client.connect();
    sockets[0].readyState = MockWebSocket.OPEN;
    sockets[0].onopen?.();
    listener.mockClear();

    sockets[0].close();

    expect(listener).toHaveBeenCalledWith({ status: 'disconnected', reason: 'closed' });
    expect(listener).toHaveBeenCalledWith({
      status: 'reconnecting',
      attempt: 1,
      delay: 1000,
    });
    expect(sockets).toHaveLength(1);

    vi.advanceTimersByTime(1000);

    expect(sockets).toHaveLength(2);
    expect(sockets[1].url).toBe('ws://localhost/ws');
  });
});
