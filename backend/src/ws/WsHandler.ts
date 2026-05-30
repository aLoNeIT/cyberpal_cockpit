import { WebSocketServer, WebSocket } from 'ws';
import type { WSMessage, ConflictEvent, TokenUpdateEvent, BudgetStatus } from '../types/index.js';
import { CONFIG } from '../config.js';

export class WsHandler {
  private wss: WebSocketServer;
  private connections: Map<WebSocket, Set<string>> = new Map();
  private heartbeatTimers: Map<WebSocket, ReturnType<typeof setInterval>> = new Map();

  constructor(wss: WebSocketServer) {
    this.wss = wss;
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
      const timer = this.heartbeatTimers.get(ws);
      if (timer) {
        clearInterval(timer);
        this.heartbeatTimers.delete(ws);
      }
      this.connections.delete(ws);
    });

    ws.on('error', () => {
      const timer = this.heartbeatTimers.get(ws);
      if (timer) {
        clearInterval(timer);
        this.heartbeatTimers.delete(ws);
      }
      this.connections.delete(ws);
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
}
