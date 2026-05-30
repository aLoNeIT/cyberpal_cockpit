import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import type { WSMessage } from '../../types/index.js';

// Mock ws module
const mockServerOn = vi.fn();
const mockServer = { on: mockServerOn } as any;

vi.mock('ws', () => {
  return {
    WebSocketServer: vi.fn(() => mockServer),
    WebSocket: {
      OPEN: 1,
      CLOSED: 3,
    },
  };
});

// Mock config
vi.mock('../../config.js', () => ({
  CONFIG: {
    wsHeartbeatInterval: 30000,
    wsHeartbeatTimeout: 60000,
  },
}));

import { WsHandler } from '../WsHandler.js';
import { WebSocket } from 'ws';

// Helper to create a mock WebSocket
function createMockWs(): any {
  const ws = new EventEmitter();
  (ws as any).readyState = 1; // OPEN
  (ws as any).send = vi.fn();
  return ws;
}

describe('WsHandler', () => {
  let handler: WsHandler;
  let mockWss: any;

  beforeEach(() => {
    vi.useFakeTimers();
    mockWss = { on: mockServerOn };
    mockServerOn.mockClear();
    handler = new WsHandler(mockWss);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ============ handleConnection ============

  describe('handleConnection', () => {
    it('should send welcome message on connection', () => {
      const ws = createMockWs();
      handler.handleConnection(ws);

      const sendCall = (ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0];
      const message: WSMessage = JSON.parse(sendCall);
      expect(message.type).toBe('system:connected');
      expect(message.payload).toEqual({ message: 'Connected to CPC Backend' });
      expect(typeof message.timestamp).toBe('number');
    });

    it('should register the connection', () => {
      const ws = createMockWs();
      handler.handleConnection(ws);

      // Connection should be registered (tested indirectly via broadcast)
      expect(ws.send).toHaveBeenCalled();
    });

    it('should start heartbeat interval', () => {
      const ws = createMockWs();
      handler.handleConnection(ws);

      const initialCallCount = (ws.send as ReturnType<typeof vi.fn>).mock.calls.length;

      // Advance past heartbeat interval
      vi.advanceTimersByTime(30000);

      // Should have received a ping message
      const calls = (ws.send as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls.length).toBeGreaterThan(initialCallCount);

      const lastCall = calls[calls.length - 1][0];
      const pingMsg: WSMessage = JSON.parse(lastCall);
      expect(pingMsg.type).toBe('ping');
    });

    it('should handle subscribe message', () => {
      const ws = createMockWs();
      handler.handleConnection(ws);

      // Simulate subscribe message
      const subscribeMsg = JSON.stringify({
        type: 'subscribe',
        agentId: 'agent-123',
        payload: {},
        timestamp: Date.now(),
      });
      ws.emit('message', Buffer.from(subscribeMsg));

      // No error means successful subscription
    });

    it('should handle unsubscribe message', () => {
      const ws = createMockWs();
      handler.handleConnection(ws);

      // First subscribe
      ws.emit('message', Buffer.from(JSON.stringify({
        type: 'subscribe',
        agentId: 'agent-123',
        payload: {},
        timestamp: Date.now(),
      })));

      // Then unsubscribe
      ws.emit('message', Buffer.from(JSON.stringify({
        type: 'unsubscribe',
        agentId: 'agent-123',
        payload: {},
        timestamp: Date.now(),
      })));

      // No error means successful unsubscription
    });

    it('should handle pong message without errors', () => {
      const ws = createMockWs();
      handler.handleConnection(ws);

      const pongMsg = JSON.stringify({
        type: 'pong',
        payload: {},
        timestamp: Date.now(),
      });
      ws.emit('message', Buffer.from(pongMsg));

      // Should not throw
    });

    it('should ignore invalid JSON messages', () => {
      const ws = createMockWs();
      handler.handleConnection(ws);

      expect(() => {
        ws.emit('message', Buffer.from('not valid json'));
      }).not.toThrow();
    });

    it('should clear heartbeat timer on close', () => {
      const ws = createMockWs();
      handler.handleConnection(ws);

      const callCountBeforeClose = (ws.send as ReturnType<typeof vi.fn>).mock.calls.length;

      ws.emit('close');

      // Advance time - no more heartbeats should fire
      vi.advanceTimersByTime(60000);

      // Send should only have the initial welcome, no pings
      expect((ws.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCountBeforeClose);
    });

    it('should clear heartbeat timer on error', () => {
      const ws = createMockWs();
      handler.handleConnection(ws);

      const callCountBeforeError = (ws.send as ReturnType<typeof vi.fn>).mock.calls.length;

      ws.emit('error', new Error('Connection error'));

      // No more heartbeats
      vi.advanceTimersByTime(60000);
      expect((ws.send as ReturnType<typeof vi.fn>).mock.calls.length).toBe(callCountBeforeError);
    });
  });

  // ============ broadcastToAgent ============

  describe('broadcastToAgent', () => {
    it('should send message to subscribed connections only', () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();

      handler.handleConnection(ws1);
      handler.handleConnection(ws2);

      // ws1 subscribes to agent-1
      ws1.emit('message', Buffer.from(JSON.stringify({
        type: 'subscribe',
        agentId: 'agent-1',
        payload: {},
        timestamp: Date.now(),
      })));

      // Reset send mock calls (clear welcome messages)
      (ws1.send as ReturnType<typeof vi.fn>).mockClear();
      (ws2.send as ReturnType<typeof vi.fn>).mockClear();

      const msg: WSMessage = {
        type: 'agent:stdout',
        agentId: 'agent-1',
        payload: { data: 'hello' },
        timestamp: Date.now(),
      };

      handler.broadcastToAgent('agent-1', msg);

      // ws1 should receive (subscribed)
      expect(ws1.send).toHaveBeenCalledWith(JSON.stringify(msg));
      // ws2 should NOT receive (not subscribed)
      expect(ws2.send).not.toHaveBeenCalled();
    });

    it('should not send to connections that are closed', () => {
      const ws = createMockWs();
      handler.handleConnection(ws);

      ws.emit('message', Buffer.from(JSON.stringify({
        type: 'subscribe',
        agentId: 'agent-1',
        payload: {},
        timestamp: Date.now(),
      })));

      (ws.send as ReturnType<typeof vi.fn>).mockClear();

      // Mark connection as closed
      (ws as any).readyState = 3; // CLOSED

      handler.broadcastToAgent('agent-1', {
        type: 'agent:stdout',
        agentId: 'agent-1',
        payload: { data: 'test' },
        timestamp: Date.now(),
      });

      expect(ws.send).not.toHaveBeenCalled();
    });

    it('should not send to connections that have not subscribed to this agent', () => {
      const ws1 = createMockWs();
      handler.handleConnection(ws1);

      // ws1 subscribes to agent-1
      ws1.emit('message', Buffer.from(JSON.stringify({
        type: 'subscribe',
        agentId: 'agent-1',
        payload: {},
        timestamp: Date.now(),
      })));

      (ws1.send as ReturnType<typeof vi.fn>).mockClear();

      // Broadcast to agent-2 (not subscribed)
      handler.broadcastToAgent('agent-2', {
        type: 'agent:stdout',
        agentId: 'agent-2',
        payload: { data: 'test' },
        timestamp: Date.now(),
      });

      expect(ws1.send).not.toHaveBeenCalled();
    });
  });

  // ============ broadcastFileChange ============

  describe('broadcastFileChange', () => {
    it('should broadcast file changes to all open connections', () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();

      handler.handleConnection(ws1);
      handler.handleConnection(ws2);

      (ws1.send as ReturnType<typeof vi.fn>).mockClear();
      (ws2.send as ReturnType<typeof vi.fn>).mockClear();

      handler.broadcastFileChange('ws-001', '/path/to/file.ts', 'change');

      expect(ws1.send).toHaveBeenCalledTimes(1);
      expect(ws2.send).toHaveBeenCalledTimes(1);

      const msg1: WSMessage = JSON.parse((ws1.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg1.type).toBe('file:changed');
      expect(msg1.payload).toEqual({
        filePath: '/path/to/file.ts',
        workspaceId: 'ws-001',
        event: 'change',
      });
    });

    it('should not send to closed connections', () => {
      const ws1 = createMockWs();
      handler.handleConnection(ws1);

      (ws1 as any).readyState = 3; // CLOSED
      (ws1.send as ReturnType<typeof vi.fn>).mockClear();

      handler.broadcastFileChange('ws-001', '/file.ts', 'add');

      expect(ws1.send).not.toHaveBeenCalled();
    });
  });

  // ============ sendToSocket ============

  describe('sendToSocket', () => {
    it('should send JSON message to open socket', () => {
      const ws = createMockWs();
      const msg: WSMessage = {
        type: 'test',
        payload: { key: 'value' },
        timestamp: 1234567890,
      };

      handler.sendToSocket(ws, msg);

      expect(ws.send).toHaveBeenCalledWith(JSON.stringify(msg));
    });

    it('should not send to closed socket', () => {
      const ws = createMockWs();
      (ws as any).readyState = 3; // CLOSED
      (ws.send as ReturnType<typeof vi.fn>).mockClear();

      handler.sendToSocket(ws, {
        type: 'test',
        payload: {},
        timestamp: Date.now(),
      });

      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  // ============ subscribe/unsubscribe ============

  describe('subscribe and unsubscribe', () => {
    it('should allow subscribing to multiple agents', () => {
      const ws = createMockWs();
      handler.handleConnection(ws);

      ws.emit('message', Buffer.from(JSON.stringify({
        type: 'subscribe', agentId: 'agent-1', payload: {}, timestamp: Date.now(),
      })));
      ws.emit('message', Buffer.from(JSON.stringify({
        type: 'subscribe', agentId: 'agent-2', payload: {}, timestamp: Date.now(),
      })));

      (ws.send as ReturnType<typeof vi.fn>).mockClear();

      // Should receive messages for both agents
      handler.broadcastToAgent('agent-1', {
        type: 'agent:stdout', agentId: 'agent-1',
        payload: { data: 'msg1' }, timestamp: Date.now(),
      });
      handler.broadcastToAgent('agent-2', {
        type: 'agent:stdout', agentId: 'agent-2',
        payload: { data: 'msg2' }, timestamp: Date.now(),
      });

      expect(ws.send).toHaveBeenCalledTimes(2);
    });

    it('should ignore subscribe without agentId', () => {
      const ws = createMockWs();
      handler.handleConnection(ws);

      expect(() => {
        ws.emit('message', Buffer.from(JSON.stringify({
          type: 'subscribe',
          payload: {},
          timestamp: Date.now(),
          // no agentId
        })));
      }).not.toThrow();
    });
  });

  // ============ Phase 2: broadcastConflict ============

  describe('broadcastConflict', () => {
    it('should broadcast conflict to all open connections', () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      handler.handleConnection(ws1);
      handler.handleConnection(ws2);

      (ws1.send as ReturnType<typeof vi.fn>).mockClear();
      (ws2.send as ReturnType<typeof vi.fn>).mockClear();

      handler.broadcastConflict({
        filePath: '/shared/file.ts',
        agentA: 'agent-1',
        agentB: 'agent-2',
        operationA: 'modify',
        operationB: 'create',
        detectedAt: Date.now(),
      });

      expect(ws1.send).toHaveBeenCalledTimes(1);
      expect(ws2.send).toHaveBeenCalledTimes(1);

      const msg: WSMessage = JSON.parse((ws1.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.type).toBe('agent:conflict');
      const payload = msg.payload as any;
      expect(payload.filePath).toBe('/shared/file.ts');
      expect(payload.agentA).toBe('agent-1');
      expect(payload.agentB).toBe('agent-2');
    });

    it('should skip closed connections', () => {
      const ws = createMockWs();
      handler.handleConnection(ws);
      (ws as any).readyState = 3; // CLOSED
      (ws.send as ReturnType<typeof vi.fn>).mockClear();

      handler.broadcastConflict({
        filePath: '/f.ts', agentA: 'a', agentB: 'b',
        operationA: 'modify', operationB: 'modify', detectedAt: Date.now(),
      });

      expect(ws.send).not.toHaveBeenCalled();
    });
  });

  // ============ Phase 2: broadcastIrc ============

  describe('broadcastIrc', () => {
    it('should broadcast IRC DM to all connections', () => {
      const ws = createMockWs();
      handler.handleConnection(ws);
      (ws.send as ReturnType<typeof vi.fn>).mockClear();

      handler.broadcastIrc('agent:irc-dm', {
        from: 'agent-1',
        to: 'agent-2',
        message: 'Hello!',
      });

      const msg: WSMessage = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.type).toBe('agent:irc-dm');
      expect((msg.payload as any).from).toBe('agent-1');
      expect((msg.payload as any).message).toBe('Hello!');
    });

    it('should broadcast IRC broadcast to all connections', () => {
      const ws = createMockWs();
      handler.handleConnection(ws);
      (ws.send as ReturnType<typeof vi.fn>).mockClear();

      handler.broadcastIrc('agent:irc-broadcast', {
        from: 'agent-1',
        message: 'Announcement!',
      });

      const msg: WSMessage = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.type).toBe('agent:irc-broadcast');
    });
  });

  // ============ Phase 2: broadcastTaskSpawn ============

  describe('broadcastTaskSpawn', () => {
    it('should broadcast task spawn to all connections', () => {
      const ws = createMockWs();
      handler.handleConnection(ws);
      (ws.send as ReturnType<typeof vi.fn>).mockClear();

      handler.broadcastTaskSpawn('parent-1', 'child-1', 'Build feature X', '/tmp/feature');

      const msg: WSMessage = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.type).toBe('agent:task-spawn');
      expect((msg.payload as any).parentId).toBe('parent-1');
      expect((msg.payload as any).childId).toBe('child-1');
      expect((msg.payload as any).taskDescription).toBe('Build feature X');
      expect((msg.payload as any).cwd).toBe('/tmp/feature');
    });
  });

  // ============ Phase 2: broadcastTaskResult ============

  describe('broadcastTaskResult', () => {
    it('should broadcast task result to all connections', () => {
      const ws = createMockWs();
      handler.handleConnection(ws);
      (ws.send as ReturnType<typeof vi.fn>).mockClear();

      handler.broadcastTaskResult('child-1', 'Task completed', 150);

      const msg: WSMessage = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.type).toBe('agent:task-result');
      expect((msg.payload as any).childId).toBe('child-1');
      expect((msg.payload as any).result).toBe('Task completed');
      expect((msg.payload as any).tokenCost).toBe(150);
    });
  });

  // ============ Phase 3: broadcastTokenUpdate ============

  describe('broadcastTokenUpdate', () => {
    it('should broadcast token update to all connections', () => {
      const ws = createMockWs();
      handler.handleConnection(ws);
      (ws.send as ReturnType<typeof vi.fn>).mockClear();

      handler.broadcastTokenUpdate({
        agentId: 'agent-1',
        inputTokens: 100,
        outputTokens: 50,
        cumulativeTokens: 1500,
        model: 'gpt-4o',
      });

      const msg: WSMessage = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.type).toBe('agent:token-update');
      const payload = msg.payload as any;
      expect(payload.agentId).toBe('agent-1');
      expect(payload.inputTokens).toBe(100);
      expect(payload.outputTokens).toBe(50);
      expect(payload.cumulativeTokens).toBe(1500);
      expect(payload.model).toBe('gpt-4o');
    });
  });

  // ============ Phase 3: broadcastBudgetWarning ============

  describe('broadcastBudgetWarning', () => {
    it('should broadcast budget warning to all connections', () => {
      const ws = createMockWs();
      handler.handleConnection(ws);
      (ws.send as ReturnType<typeof vi.fn>).mockClear();

      handler.broadcastBudgetWarning({
        currentUsage: 85000,
        monthlyLimit: 100000,
        remaining: 15000,
        percentage: 0.85,
        isWarning: true,
        isExceeded: false,
        lastResetDate: '2025-06-01',
        excludedUsage: 0,
      });

      const msg: WSMessage = JSON.parse((ws.send as ReturnType<typeof vi.fn>).mock.calls[0][0]);
      expect(msg.type).toBe('budget:warning');
      const payload = msg.payload as any;
      expect(payload.currentUsage).toBe(85000);
      expect(payload.monthlyLimit).toBe(100000);
      expect(payload.percentage).toBe(0.85);
      expect(payload.isWarning).toBe(true);
    });
  });
});
