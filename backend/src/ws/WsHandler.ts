import { WebSocketServer, WebSocket } from 'ws';
import type {
  WSMessage,
  ConflictEvent,
  TokenUpdateEvent,
  BudgetStatus,
  TerminalCreatePayload,
  TerminalInputPayload,
  TerminalResizePayload,
  TerminalSessionPayload,
} from '../types/index.js';
import { CONFIG } from '../config.js';
import type { TerminalSessionService } from '../services/TerminalSessionService.js';

export class WsHandler {
  private wss: WebSocketServer;
  private connections: Map<WebSocket, Set<string>> = new Map();
  private heartbeatTimers: Map<WebSocket, ReturnType<typeof setInterval>> = new Map();
  private terminalSessionsBySocket: Map<WebSocket, Set<string>> = new Map();
  private terminalSocketBySession: Map<string, WebSocket> = new Map();
  private terminalSessionService?: TerminalSessionService;

  constructor(wss: WebSocketServer, terminalSessionService?: TerminalSessionService) {
    this.wss = wss;
    this.terminalSessionService = terminalSessionService;
    this.bindTerminalService();
  }

  handleConnection(ws: WebSocket): void {
    this.connections.set(ws, new Set());

    // 发送欢迎消息
    this.sendToSocket(ws, {
      type: 'system:connected',
      payload: { message: 'Connected to CPC Backend' },
      timestamp: Date.now(),
    });

    // 心跳检测
    const heartbeatTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        this.sendToSocket(ws, {
          type: 'ping',
          payload: {},
          timestamp: Date.now(),
        });
      }
    }, CONFIG.wsHeartbeatInterval);

    this.heartbeatTimers.set(ws, heartbeatTimer);

    // 客户端消息处理
    ws.on('message', (raw: Buffer) => {
      try {
        const msg: WSMessage = JSON.parse(raw.toString());

        if (msg.type === 'pong') {
          return;
        }

        if (this.handleTerminalMessage(ws, msg)) {
          return;
        }

        if (msg.type === 'subscribe' && msg.agentId) {
          const subs = this.connections.get(ws);
          if (subs) {
            subs.add(msg.agentId);
          }
          return;
        }

        if (msg.type === 'unsubscribe' && msg.agentId) {
          const subs = this.connections.get(ws);
          if (subs) {
            subs.delete(msg.agentId);
          }
          return;
        }

      } catch {
        // 忽略无效消息
      }
    });

    ws.on('close', () => {
      this.cleanupSocket(ws);
    });

    ws.on('error', () => {
      this.cleanupSocket(ws);
    });
  }

  broadcastToAgent(agentId: string, message: WSMessage): void {
    for (const [ws, subs] of this.connections) {
      if (subs.has(agentId) && ws.readyState === WebSocket.OPEN) {
        this.sendToSocket(ws, message);
      }
    }
  }

  broadcastFileChange(workspaceId: string, filePath: string, event: 'add' | 'change' | 'unlink'): void {
    const message: WSMessage = {
      type: 'file:changed',
      payload: { filePath, workspaceId, event },
      timestamp: Date.now(),
    };

    for (const [ws] of this.connections) {
      if (ws.readyState === WebSocket.OPEN) {
        this.sendToSocket(ws, message);
      }
    }
  }

  /**
   * Phase 2: 广播冲突事件（全局广播，顶栏角标 + 被冲突 agent 终端均需接收）
   */
  broadcastConflict(conflict: ConflictEvent): void {
    const message: WSMessage = {
      type: 'agent:conflict',
      payload: conflict,
      timestamp: Date.now(),
    };

    this.broadcastToAll(message);
  }

  /**
   * Phase 2: 广播 IRC 消息（全局广播到所有连接的客户端）
   */
  broadcastIrc(type: 'agent:irc-dm' | 'agent:irc-broadcast', payload: Record<string, unknown>): void {
    const message: WSMessage = {
      type,
      payload,
      timestamp: Date.now(),
    };

    this.broadcastToAll(message);
  }

  /**
   * Phase 2: Task spawn 事件（全局广播）
   */
  broadcastTaskSpawn(parentId: string, childId: string, taskDescription: string, cwd: string): void {
    const message: WSMessage = {
      type: 'agent:task-spawn',
      payload: { parentId, childId, taskDescription, cwd },
      timestamp: Date.now(),
    };

    this.broadcastToAll(message);
  }

  /**
   * Phase 2: Task result 事件（全局广播）
   */
  broadcastTaskResult(childId: string, result: string, tokenCost: number): void {
    const message: WSMessage = {
      type: 'agent:task-result',
      payload: { childId, result, tokenCost },
      timestamp: Date.now(),
    };

    this.broadcastToAll(message);
  }

  /**
   * Phase 3: 广播 Token 更新事件
   */
  broadcastTokenUpdate(event: TokenUpdateEvent): void {
    const message: WSMessage = {
      type: 'agent:token-update',
      payload: event,
      timestamp: Date.now(),
    };

    this.broadcastToAll(message);
  }

  /**
   * Phase 3: 广播预算预警事件
   */
  broadcastBudgetWarning(status: BudgetStatus): void {
    const message: WSMessage = {
      type: 'budget:warning',
      payload: status,
      timestamp: Date.now(),
    };

    this.broadcastToAll(message);
  }

  sendToSocket(ws: WebSocket, message: WSMessage): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * 广播到所有已连接客户端
   */
  private broadcastToAll(message: WSMessage): void {
    for (const [ws] of this.connections) {
      if (ws.readyState === WebSocket.OPEN) {
        this.sendToSocket(ws, message);
      }
    }
  }

  private bindTerminalService(): void {
    if (!this.terminalSessionService) return;

    this.terminalSessionService.onData = (sessionId, data) => {
      const ws = this.terminalSocketBySession.get(sessionId);
      if (!ws) return;
      this.sendToSocket(ws, {
        type: 'terminal:data',
        payload: { sessionId, data },
        timestamp: Date.now(),
      });
    };

    this.terminalSessionService.onCwd = (sessionId, cwd) => {
      const ws = this.terminalSocketBySession.get(sessionId);
      if (!ws) return;
      this.sendToSocket(ws, {
        type: 'terminal:cwd',
        payload: { sessionId, cwd },
        timestamp: Date.now(),
      });
    };

    this.terminalSessionService.onExit = (sessionId, exitCode, signal) => {
      const ws = this.terminalSocketBySession.get(sessionId);
      if (!ws) return;

      this.removeTerminalOwnership(ws, sessionId);
      this.sendToSocket(ws, {
        type: 'terminal:exit',
        payload: { sessionId, exitCode, signal },
        timestamp: Date.now(),
      });
    };

    this.terminalSessionService.onError = (sessionId, message) => {
      const ws = sessionId ? this.terminalSocketBySession.get(sessionId) : undefined;
      const payload = { sessionId, message };

      if (ws) {
        this.sendToSocket(ws, {
          type: 'terminal:error',
          payload,
          timestamp: Date.now(),
        });
        return;
      }

      this.broadcastToAll({
        type: 'terminal:error',
        payload,
        timestamp: Date.now(),
      });
    };
  }

  private handleTerminalMessage(ws: WebSocket, msg: WSMessage): boolean {
    if (!msg.type.startsWith('terminal:')) return false;

    if (!this.terminalSessionService) {
      this.sendTerminalError(ws, undefined, 'Terminal service is not available');
      return true;
    }

    try {
      switch (msg.type) {
        case 'terminal:create': {
          const payload = msg.payload as Partial<TerminalCreatePayload>;
          if (!this.isPositiveDimension(payload.cols) || !this.isPositiveDimension(payload.rows)) {
            this.sendTerminalError(ws, undefined, 'cols and rows are required');
            return true;
          }

          const session = this.terminalSessionService.createSession({
            cwd: payload.cwd,
            shell: payload.shell,
            cols: payload.cols,
            rows: payload.rows,
          });

          this.addTerminalOwnership(ws, session.id);
          this.sendToSocket(ws, {
            type: 'terminal:created',
            payload: {
              sessionId: session.id,
              cwd: session.cwd,
              shell: session.shell,
              pid: session.pid,
            },
            timestamp: Date.now(),
          });
          return true;
        }

        case 'terminal:input': {
          const payload = msg.payload as Partial<TerminalInputPayload>;
          if (this.ownsTerminalSession(ws, payload.sessionId) && typeof payload.data === 'string') {
            this.terminalSessionService.write(payload.sessionId, payload.data);
          }
          return true;
        }

        case 'terminal:resize': {
          const payload = msg.payload as Partial<TerminalResizePayload>;
          if (
            this.ownsTerminalSession(ws, payload.sessionId)
            && this.isPositiveDimension(payload.cols)
            && this.isPositiveDimension(payload.rows)
          ) {
            this.terminalSessionService.resize(payload.sessionId, payload.cols, payload.rows);
          }
          return true;
        }

        case 'terminal:cwd-request': {
          const payload = msg.payload as Partial<TerminalSessionPayload>;
          if (this.ownsTerminalSession(ws, payload.sessionId)) {
            this.terminalSessionService.requestCwd(payload.sessionId);
          }
          return true;
        }

        case 'terminal:kill': {
          const payload = msg.payload as Partial<TerminalSessionPayload>;
          if (this.ownsTerminalSession(ws, payload.sessionId)) {
            this.terminalSessionService.kill(payload.sessionId);
          }
          return true;
        }

        default:
          return true;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Terminal request failed';
      this.sendTerminalError(ws, undefined, message);
      return true;
    }
  }

  private addTerminalOwnership(ws: WebSocket, sessionId: string): void {
    if (!this.terminalSessionsBySocket.has(ws)) {
      this.terminalSessionsBySocket.set(ws, new Set());
    }
    this.terminalSessionsBySocket.get(ws)!.add(sessionId);
    this.terminalSocketBySession.set(sessionId, ws);
  }

  private removeTerminalOwnership(ws: WebSocket, sessionId: string): void {
    const sessions = this.terminalSessionsBySocket.get(ws);
    if (sessions) {
      sessions.delete(sessionId);
      if (sessions.size === 0) {
        this.terminalSessionsBySocket.delete(ws);
      }
    }
    this.terminalSocketBySession.delete(sessionId);
  }

  private ownsTerminalSession(ws: WebSocket, sessionId: unknown): sessionId is string {
    return typeof sessionId === 'string' && this.terminalSessionsBySocket.get(ws)?.has(sessionId) === true;
  }

  private cleanupSocket(ws: WebSocket): void {
    const timer = this.heartbeatTimers.get(ws);
    if (timer) {
      clearInterval(timer);
      this.heartbeatTimers.delete(ws);
    }

    this.connections.delete(ws);

    const terminalSessionIds = Array.from(this.terminalSessionsBySocket.get(ws) || []);
    if (terminalSessionIds.length > 0) {
      this.terminalSessionService?.killAll(terminalSessionIds);
      for (const sessionId of terminalSessionIds) {
        this.terminalSocketBySession.delete(sessionId);
      }
      this.terminalSessionsBySocket.delete(ws);
    }
  }

  private sendTerminalError(ws: WebSocket, sessionId: string | undefined, message: string): void {
    this.sendToSocket(ws, {
      type: 'terminal:error',
      payload: { sessionId, message },
      timestamp: Date.now(),
    });
  }

  private isPositiveDimension(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
  }
}
