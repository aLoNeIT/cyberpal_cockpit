import { CONNECTION } from '@/utils/constants';
import type { WSMessage } from '@/types';

export type MessageHandler = (message: WSMessage) => void;
export type ConnectionChangeEvent =
  | { status: 'connected' }
  | { status: 'reconnecting'; attempt: number; delay: number }
  | { status: 'disconnected'; reason: 'closed' | 'heartbeat-timeout' | 'max-reconnect-attempts' }
  | { status: 'error'; error: Event };
export type ConnectionChangeHandler = (event: ConnectionChangeEvent) => void;

export class WSClient {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private connectionHandlers: Set<ConnectionChangeHandler> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimeout: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;
  private pendingMessages: Array<Partial<WSMessage> & { type: string }> = [];
  private nextCloseReason: 'closed' | 'heartbeat-timeout' = 'closed';

  public onConnected: (() => void) | null = null;
  public onDisconnected: (() => void) | null = null;
  public onError: ((error: Event) => void) | null = null;

  constructor(url?: string) {
    this.url = url || CONNECTION.wsUrl;
  }

  connect(): void {
    if (this.ws?.readyState === WebSocket.OPEN || this.ws?.readyState === WebSocket.CONNECTING) {
      return;
    }

    this.intentionalClose = false;

    try {
      this.ws = new WebSocket(this.url);

      this.ws.onopen = () => {
        this.reconnectAttempts = 0;
        this.nextCloseReason = 'closed';
        this.flushPendingMessages();
        this.startHeartbeat();
        this.onConnected?.();
        this.notifyConnectionChange({ status: 'connected' });
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);

          // 心跳处理
          if (msg.type === 'ping') {
            this.resetPongTimeout();
            this.send({ type: 'pong', payload: {}, timestamp: Date.now() });
            return;
          }
          if (msg.type === 'pong') {
            this.resetPongTimeout();
            return;
          }

          // 分发到注册的处理器
          const handlers = this.handlers.get(msg.type);
          if (handlers) {
            handlers.forEach((handler) => handler(msg));
          }
        } catch {
          // 忽略无效 JSON
        }
      };

      this.ws.onclose = () => {
        this.stopHeartbeat();
        this.onDisconnected?.();
        this.notifyConnectionChange({ status: 'disconnected', reason: this.nextCloseReason });
        this.nextCloseReason = 'closed';

        if (!this.intentionalClose) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error: Event) => {
        this.onError?.(error);
        this.notifyConnectionChange({ status: 'error', error });
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.stopHeartbeat();
    this.cancelReconnect();
    this.pendingMessages = [];
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(message: Partial<WSMessage> & { type: string }): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendNow(message);
      return;
    }

    if (this.ws?.readyState === WebSocket.CONNECTING) {
      this.pendingMessages.push(message);
    }
  }

  subscribe(agentId: string): void {
    this.send({ type: 'subscribe', agentId, payload: {} });
  }

  unsubscribe(agentId: string): void {
    this.send({ type: 'unsubscribe', agentId, payload: {} });
  }

  on(type: string, handler: MessageHandler): void {
    if (!this.handlers.has(type)) {
      this.handlers.set(type, new Set());
    }
    this.handlers.get(type)!.add(handler);
  }

  off(type: string, handler: MessageHandler): void {
    const handlers = this.handlers.get(type);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  onConnectionChange(handler: ConnectionChangeHandler): () => void {
    this.connectionHandlers.add(handler);
    return () => {
      this.connectionHandlers.delete(handler);
    };
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose) return;
    if (this.reconnectTimer) return;

    if (this.reconnectAttempts >= CONNECTION.reconnectMaxAttempts) {
      console.error('[WSClient] Max reconnect attempts reached');
      this.notifyConnectionChange({ status: 'disconnected', reason: 'max-reconnect-attempts' });
      return;
    }

    const delay = Math.min(
      CONNECTION.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts),
      CONNECTION.reconnectMaxDelay,
    );
    const attempt = this.reconnectAttempts + 1;

    this.notifyConnectionChange({ status: 'reconnecting', attempt, delay });

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.reconnectAttempts++;
      this.connect();
    }, delay);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private startHeartbeat(): void {
    this.resetPongTimeout();
  }

  private flushPendingMessages(): void {
    const messages = [...this.pendingMessages];
    this.pendingMessages = [];
    messages.forEach((message) => this.send(message));
  }

  private sendNow(message: Partial<WSMessage> & { type: string }): void {
    const fullMessage: WSMessage = {
      ...message,
      timestamp: message.timestamp || Date.now(),
      agentId: message.agentId,
      payload: message.payload ?? {},
    } as WSMessage;
    this.ws?.send(JSON.stringify(fullMessage));
  }

  private resetPongTimeout(): void {
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
    }
    this.pongTimeout = setTimeout(() => {
      console.warn('[WSClient] Heartbeat timeout, reconnecting...');
      this.nextCloseReason = 'heartbeat-timeout';
      this.ws?.close();
    }, CONNECTION.heartbeatTimeout);
  }

  private stopHeartbeat(): void {
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
      this.pongTimeout = null;
    }
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private notifyConnectionChange(event: ConnectionChangeEvent): void {
    this.connectionHandlers.forEach((handler) => handler(event));
  }
}

// 单例
let instance: WSClient | null = null;

export function getWSClient(): WSClient {
  if (!instance) {
    instance = new WSClient();
  }
  return instance;
}
