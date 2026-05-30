import { CONNECTION } from '@/utils/constants';
import type { WSMessage } from '@/types';

export type MessageHandler = (message: WSMessage) => void;

export class WSClient {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: Map<string, Set<MessageHandler>> = new Map();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimeout: ReturnType<typeof setTimeout> | null = null;
  private intentionalClose = false;

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
        this.startHeartbeat();
        this.onConnected?.();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const msg: WSMessage = JSON.parse(event.data);

          // 心跳处理
          if (msg.type === 'ping') {
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

        if (!this.intentionalClose) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (error: Event) => {
        this.onError?.(error);
      };
    } catch {
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.intentionalClose = true;
    this.stopHeartbeat();
    this.cancelReconnect();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  send(message: Partial<WSMessage> & { type: string }): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      const fullMessage: WSMessage = {
        ...message,
        timestamp: message.timestamp || Date.now(),
        agentId: message.agentId,
        payload: message.payload ?? {},
      } as WSMessage;
      this.ws.send(JSON.stringify(fullMessage));
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

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private scheduleReconnect(): void {
    if (this.intentionalClose) return;
    if (this.reconnectAttempts >= CONNECTION.reconnectMaxAttempts) {
      console.error('[WSClient] Max reconnect attempts reached');
      return;
    }

    const delay = Math.min(
      CONNECTION.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts),
      CONNECTION.reconnectMaxDelay,
    );

    this.reconnectTimer = setTimeout(() => {
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

  private resetPongTimeout(): void {
    if (this.pongTimeout) {
      clearTimeout(this.pongTimeout);
    }
    this.pongTimeout = setTimeout(() => {
      console.warn('[WSClient] Heartbeat timeout, reconnecting...');
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
}

// 单例
let instance: WSClient | null = null;

export function getWSClient(): WSClient {
  if (!instance) {
    instance = new WSClient();
  }
  return instance;
}
