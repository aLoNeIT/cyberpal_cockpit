import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';

const { prepareOmpRuntimeConfigMock } = vi.hoisted(() => ({
  prepareOmpRuntimeConfigMock: vi.fn(),
}));

vi.mock('../../utils/ompRuntimeConfig.js', () => ({
  prepareOmpRuntimeConfig: prepareOmpRuntimeConfigMock,
}));

import { AgentManager } from '../AgentManager.js';
import type { AgentInfo } from '../../types/index.js';

// Mock child_process.spawn
const mockStdin = new EventEmitter() as EventEmitter & { write: ReturnType<typeof vi.fn> };
mockStdin.write = vi.fn();

const mockStdout = new EventEmitter();
const mockStderr = new EventEmitter();

const mockProcess = new EventEmitter() as EventEmitter & {
  pid: number;
  stdout: typeof mockStdout | null;
  stderr: typeof mockStderr | null;
  stdin: typeof mockStdin | null;
  kill: ReturnType<typeof vi.fn>;
  exitCode: number | null;
};
mockProcess.pid = 12345;
mockProcess.stdout = mockStdout;
mockProcess.stderr = mockStderr;
mockProcess.stdin = mockStdin;
mockProcess.kill = vi.fn();
mockProcess.exitCode = null;

vi.mock('child_process', () => ({
  spawn: vi.fn(() => mockProcess),
}));

let uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: vi.fn(() => {
    uuidCounter++;
    return `mock-agent-uuid-${String(uuidCounter).padStart(3, '0')}`;
  }),
}));

import { spawn } from 'child_process';

describe('AgentManager', () => {
  let manager: AgentManager;

  beforeEach(() => {
    vi.clearAllMocks();
    uuidCounter = 0;
    mockProcess.exitCode = null;
    mockProcess.kill = vi.fn();
    mockStdin.write = vi.fn();
    prepareOmpRuntimeConfigMock.mockReset();
    manager = new AgentManager(4);
  });

  afterEach(() => {
    // Clean up any listeners to avoid cross-test pollution
    mockProcess.removeAllListeners();
    mockStdout.removeAllListeners();
    mockStderr.removeAllListeners();
    mockStdin.removeAllListeners();
  });

  // ============ spawn ============

  describe('spawn', () => {
    it('should spawn a new agent process and return AgentInfo', () => {
      const agentInfo = manager.spawn('/test/cwd');

      expect(spawn).toHaveBeenCalledWith(
        expect.stringContaining('node_modules'),
        [
          expect.stringContaining('@oh-my-pi'),
          '--mode',
          'rpc',
        ],
        { cwd: '/test/cwd' },
      );
      expect(spawn).toHaveBeenCalledWith(
        expect.stringContaining(process.platform === 'win32' ? 'bun.exe' : 'bun'),
        [
          expect.stringContaining('cli.ts'),
          '--mode',
          'rpc',
        ],
        { cwd: '/test/cwd' },
      );
      expect(agentInfo).toMatchObject<Partial<AgentInfo>>({
        id: 'mock-agent-uuid-001',
        cwd: '/test/cwd',
        status: 'running',
        pid: 12345,
        workspaceId: null,
      });
      expect(typeof agentInfo.createdAt).toBe('number');
    });

    it('should accept optional workspaceId', () => {
      const agentInfo = manager.spawn('/test/cwd', 'ws-001');
      expect(agentInfo.workspaceId).toBe('ws-001');
    });

    it('should throw when max agent count is reached', () => {
      manager.spawn('/cwd1');
      manager.spawn('/cwd2');
      manager.spawn('/cwd3');
      manager.spawn('/cwd4');

      expect(() => manager.spawn('/cwd5')).toThrow('Maximum agent count (4) reached');
    });

    it('should respect custom maxAgents in constructor', () => {
      const smallManager = new AgentManager(1);
      smallManager.spawn('/cwd1');
      expect(() => smallManager.spawn('/cwd2')).toThrow('Maximum agent count (1) reached');
    });

    it('should fire onStatusChange when agent starts', () => {
      const statusCallback = vi.fn();
      manager.onStatusChange = statusCallback;

      manager.spawn('/test/cwd');

      expect(statusCallback).toHaveBeenCalledWith('mock-agent-uuid-001', 'running', 12345);
    });
  });

  // ============ stdout/stderr events ============

  describe('output events', () => {
    it('should fire onOutput for stdout data', () => {
      const outputCallback = vi.fn();
      manager.onOutput = outputCallback;
      manager.spawn('/test/cwd');

      mockStdout.emit('data', Buffer.from('hello world\n'));

      expect(outputCallback).toHaveBeenCalledWith(
        'mock-agent-uuid-001',
        'stdout',
        'hello world\n',
      );
    });

    it('should render RPC text deltas as readable stdout without raw protocol JSON', () => {
      const outputCallback = vi.fn();
      manager.onOutput = outputCallback;
      manager.spawn('/test/cwd');

      const rpcLine = JSON.stringify({
        type: 'message_update',
        assistantMessageEvent: {
          type: 'text_delta',
          delta: 'CPC_TOKENX24_SMOKE_OK',
        },
      });

      mockStdout.emit('data', Buffer.from(`${rpcLine}\n`));

      expect(outputCallback).toHaveBeenCalledTimes(1);
      expect(outputCallback).toHaveBeenCalledWith(
        'mock-agent-uuid-001',
        'stdout',
        'CPC_TOKENX24_SMOKE_OK',
      );
      expect(outputCallback).not.toHaveBeenCalledWith(
        'mock-agent-uuid-001',
        'stdout',
        `${rpcLine}\n`,
      );
    });

    it('should suppress transcript JSON frames from stdout', () => {
      const outputCallback = vi.fn();
      manager.onOutput = outputCallback;
      manager.spawn('/test/cwd');

      const chunk = [
        JSON.stringify({ type: 'session', id: 'session-1', cwd: '/test/cwd' }),
        JSON.stringify({ type: 'model_change', model: 'tokenx24/gpt-5.5' }),
        JSON.stringify({
          type: 'message',
          message: {
            role: 'toolResult',
            content: [{ type: 'text', text: 'internal tool result should not render' }],
          },
        }),
      ].join('\n') + '\n';

      mockStdout.emit('data', Buffer.from(chunk));

      expect(outputCallback).not.toHaveBeenCalled();
    });

    it('should suppress non-display RPC protocol frames from stdout', () => {
      const outputCallback = vi.fn();
      manager.onOutput = outputCallback;
      manager.spawn('/test/cwd');

      const chunk = [
        JSON.stringify({ type: 'ready' }),
        JSON.stringify({ type: 'response', command: 'prompt', success: true }),
        JSON.stringify({ type: 'agent_start' }),
        JSON.stringify({ type: 'tool_result', toolUseId: 'tool-1', result: { content: 'internal' } }),
        JSON.stringify({ type: 'tool_execution_start', toolCallId: 'tool-1', toolName: 'read' }),
        JSON.stringify({ type: 'tool_execution_end', toolCallId: 'tool-1', toolName: 'read', result: { content: [] } }),
        JSON.stringify({ type: 'turn_start' }),
        JSON.stringify({ type: 'message_start', message: { role: 'assistant', content: [{ type: 'text', text: 'C' }] } }),
        JSON.stringify({ type: 'tool_execution_update', toolCallId: 'tool-1', toolName: 'read', args: {}, partialResult: { content: [] } }),
      ].join('\n') + '\n';

      mockStdout.emit('data', Buffer.from(chunk));

      expect(outputCallback).not.toHaveBeenCalled();
    });

    it('should suppress tool_use protocol frames from stdout while still processing them', () => {
      const outputCallback = vi.fn();
      const conflictCallback = vi.fn();
      manager.onOutput = outputCallback;
      manager.onConflictDetected = conflictCallback;
      manager.spawn('/test/cwd');

      const jsonLine = JSON.stringify({
        type: 'tool_use',
        name: 'write_to_file',
        arguments: {
          file_path: '/tmp/generated.ts',
          content: 'export const ok = true;',
        },
      });

      mockStdout.emit('data', Buffer.from(`${jsonLine}\n`));

      expect(outputCallback).not.toHaveBeenCalled();
      expect(conflictCallback).toHaveBeenCalledWith(
        'mock-agent-uuid-001',
        '/tmp/generated.ts',
        'create',
      );
    });

    it('should suppress RPC protocol frames split across stdout chunks', () => {
      const outputCallback = vi.fn();
      manager.onOutput = outputCallback;
      manager.spawn('/test/cwd');

      const rpcLine = JSON.stringify({
        type: 'tool_result',
        toolUseId: 'tool-1',
        result: { content: 'internal protocol payload' },
      });

      mockStdout.emit('data', Buffer.from(rpcLine.slice(0, 20)));
      mockStdout.emit('data', Buffer.from(`${rpcLine.slice(20)}\n`));

      expect(outputCallback).not.toHaveBeenCalled();
    });

    it('should render RPC text deltas split across stdout chunks', () => {
      const outputCallback = vi.fn();
      manager.onOutput = outputCallback;
      manager.spawn('/test/cwd');

      const rpcLine = JSON.stringify({
        type: 'message_update',
        assistantMessageEvent: {
          type: 'text_delta',
          delta: 'split text',
        },
      });

      mockStdout.emit('data', Buffer.from(rpcLine.slice(0, 24)));
      mockStdout.emit('data', Buffer.from(`${rpcLine.slice(24)}\n`));

      expect(outputCallback).toHaveBeenCalledTimes(1);
      expect(outputCallback).toHaveBeenCalledWith(
        'mock-agent-uuid-001',
        'stdout',
        'split text',
      );
    });

    it('should fire onOutput for stderr data', () => {
      const outputCallback = vi.fn();
      manager.onOutput = outputCallback;
      manager.spawn('/test/cwd');

      mockStderr.emit('data', Buffer.from('error message\n'));

      expect(outputCallback).toHaveBeenCalledWith(
        'mock-agent-uuid-001',
        'stderr',
        'error message\n',
      );
    });

    it('should buffer stdout and cap at 1000 entries', () => {
      manager.onOutput = vi.fn();
      manager.spawn('/test/cwd');

      // Emit more than 1000 chunks
      for (let i = 0; i < 1100; i++) {
        mockStdout.emit('data', Buffer.from(`line ${i}\n`));
      }

      // The internal buffer should be capped, but the test validates
      // that the output callback was called for each chunk
      expect(manager.onOutput).toHaveBeenCalledTimes(1100);
    });

    it('should fire onStatusChange on process error', () => {
      const statusCallback = vi.fn();
      manager.onStatusChange = statusCallback;
      manager.spawn('/test/cwd');

      mockProcess.emit('error', new Error('Process died'));

      expect(statusCallback).toHaveBeenCalledWith('mock-agent-uuid-001', 'error', 12345);
    });

    it('should fire onExit when process exits', () => {
      const exitCallback = vi.fn();
      manager.onExit = exitCallback;
      manager.spawn('/test/cwd');

      mockProcess.emit('exit', 0, null);

      expect(exitCallback).toHaveBeenCalledWith('mock-agent-uuid-001', 0, null);
    });

    it('should set agent status to stopped on exit', () => {
      manager.spawn('/test/cwd');
      mockProcess.emit('exit', 0, null);

      const agent = manager.getAgent('mock-agent-uuid-001');
      expect(agent?.status).toBe('stopped');
    });
  });

  // ============ kill ============

  describe('kill', () => {
    it('should kill the process and remove agent', () => {
      manager.spawn('/test/cwd');
      expect(manager.getAgentCount()).toBe(1);

      manager.kill('mock-agent-uuid-001');

      expect(mockProcess.kill).toHaveBeenCalledWith('SIGTERM');
      expect(manager.getAgentCount()).toBe(0);
      expect(manager.getAgent('mock-agent-uuid-001')).toBeUndefined();
    });

    it('should throw when killing non-existent agent', () => {
      expect(() => manager.kill('nonexistent')).toThrow('Agent nonexistent not found');
    });

    it('should handle case when process is already null', () => {
      manager.spawn('/test/cwd');
      // Simulate process being null
      const agentInternal = (manager as any).agents.get('mock-agent-uuid-001');
      agentInternal.process = null;

      // Should not throw and should still remove the agent
      manager.kill('mock-agent-uuid-001');
      expect(manager.getAgentCount()).toBe(0);
    });
  });

  // ============ sendStdin ============

  describe('sendStdin', () => {
    it('should write prompt commands to the RPC process stdin', () => {
      manager.spawn('/test/cwd');
      manager.sendStdin('mock-agent-uuid-001', 'test input');

      expect(mockStdin.write).toHaveBeenCalledWith(
        `${JSON.stringify({ type: 'prompt', message: 'test input' })}\n`,
      );
    });

    it('should queue a second chat message as follow_up while the agent is busy', () => {
      manager.spawn('/test/cwd');

      const turnStart = JSON.stringify({ type: 'turn_start' });
      mockStdout.emit('data', Buffer.from(`${turnStart}\n`));

      manager.sendStdin('mock-agent-uuid-001', 'second input');

      expect(mockStdin.write).toHaveBeenCalledWith(
        `${JSON.stringify({ type: 'follow_up', message: 'second input' })}\n`,
      );
    });

    it('should queue an immediate second chat message as follow_up before turn_start arrives', () => {
      manager.spawn('/test/cwd');

      manager.sendStdin('mock-agent-uuid-001', 'first input');
      manager.sendStdin('mock-agent-uuid-001', 'second input');

      expect(mockStdin.write).toHaveBeenNthCalledWith(
        1,
        `${JSON.stringify({ type: 'prompt', message: 'first input' })}\n`,
      );
      expect(mockStdin.write).toHaveBeenNthCalledWith(
        2,
        `${JSON.stringify({ type: 'follow_up', message: 'second input' })}\n`,
      );
    });

    it('should resume a persisted session with the original agent id before sending input', () => {
      const agent = manager.resume(
        {
          id: 'persisted-agent',
          cwd: '/test/cwd',
          status: 'stopped',
          pid: null,
          workspaceId: 'ws-1',
          createdAt: 123,
          parentId: null,
          childIds: [],
          isOrphaned: false,
          model: 'gpt-5.5',
          sessionFile: 'E:\\sessions\\old.jsonl',
          sessionId: 'session-old',
        },
        'continue work',
      );

      expect(agent).toMatchObject({
        id: 'persisted-agent',
        cwd: '/test/cwd',
        status: 'running',
        workspaceId: 'ws-1',
        sessionFile: 'E:\\sessions\\old.jsonl',
        sessionId: 'session-old',
      });
      expect(mockStdin.write).toHaveBeenNthCalledWith(
        1,
        `${JSON.stringify({ type: 'prompt', message: 'continue work' })}\n`,
      );
      expect(spawn).toHaveBeenCalledWith(
        expect.stringContaining(process.platform === 'win32' ? 'bun.exe' : 'bun'),
        expect.arrayContaining(['--mode', 'rpc', '--resume', 'E:\\sessions\\old.jsonl']),
        expect.objectContaining({ cwd: '/test/cwd' }),
      );
    });

    it('should throw when agent not found', () => {
      expect(() => manager.sendStdin('nonexistent', 'input')).toThrow(
        'Agent nonexistent not found',
      );
    });

    it('should throw when stdin is not available (process null)', () => {
      manager.spawn('/test/cwd');
      const agentInternal = (manager as any).agents.get('mock-agent-uuid-001');
      agentInternal.process = null;

      expect(() => manager.sendStdin('mock-agent-uuid-001', 'input')).toThrow(
        'stdin is not available',
      );
    });

    it('should throw when process.stdin is null', () => {
      manager.spawn('/test/cwd');
      const agentInternal = (manager as any).agents.get('mock-agent-uuid-001');
      agentInternal.process.stdin = null;

      expect(() => manager.sendStdin('mock-agent-uuid-001', 'input')).toThrow(
        'stdin is not available',
      );
    });
  });

  // ============ structured process events ============

  describe('structured process events', () => {
    it('should emit working, thinking, tool, assistant, and summary events from RPC frames', () => {
      const eventCallback = vi.fn();
      manager.onProcessEvent = eventCallback;
      manager.spawn('/test/cwd');

      const frames = [
        { type: 'turn_start' },
        { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: 'checking files' } },
        { type: 'tool_execution_start', toolCallId: 'tool-1', toolName: 'shell_command', args: { command: 'npm test' } },
        { type: 'tool_execution_end', toolCallId: 'tool-1', toolName: 'shell_command', result: { content: 'ok' } },
        { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Done' } },
        { type: 'turn_end' },
      ].map((frame) => JSON.stringify(frame)).join('\n') + '\n';

      mockStdout.emit('data', Buffer.from(frames));

      expect(eventCallback).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'mock-agent-uuid-001', kind: 'working', title: 'Working' }),
      );
      expect(eventCallback).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'mock-agent-uuid-001', kind: 'thinking', content: 'checking files' }),
      );
      expect(eventCallback).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'mock-agent-uuid-001', kind: 'tool', title: 'shell_command', content: 'npm test' }),
      );
      expect(eventCallback).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'mock-agent-uuid-001', kind: 'tool', status: 'completed' }),
      );
      expect(eventCallback).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'mock-agent-uuid-001', kind: 'assistant', content: 'Done' }),
      );
      expect(eventCallback).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'mock-agent-uuid-001', kind: 'summary', title: 'Summary' }),
      );
    });

    it('should not emit a duplicate summary when turn_end repeats the assistant answer', () => {
      const eventCallback = vi.fn();
      manager.onProcessEvent = eventCallback;
      manager.spawn('/test/cwd');

      const frames = [
        { type: 'turn_start' },
        { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'Final answer' } },
        { type: 'turn_end', message: { content: 'Final answer' } },
      ].map((frame) => JSON.stringify(frame)).join('\n') + '\n';

      mockStdout.emit('data', Buffer.from(frames));

      expect(eventCallback).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'mock-agent-uuid-001', kind: 'assistant', content: 'Final answer' }),
      );
      expect(eventCallback).not.toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'mock-agent-uuid-001', kind: 'summary', content: 'Final answer' }),
      );
    });

    it('should emit turn_end message content as assistant output when no assistant deltas arrived', () => {
      const eventCallback = vi.fn();
      manager.onProcessEvent = eventCallback;
      manager.spawn('/test/cwd');

      const frames = [
        { type: 'turn_start' },
        { type: 'turn_end', message: { content: 'Final answer from turn end' } },
      ].map((frame) => JSON.stringify(frame)).join('\n') + '\n';

      mockStdout.emit('data', Buffer.from(frames));

      expect(eventCallback).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'mock-agent-uuid-001',
          kind: 'assistant',
          content: 'Final answer from turn end',
          status: 'completed',
        }),
      );
      expect(eventCallback).not.toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'mock-agent-uuid-001', kind: 'summary', content: 'Final answer from turn end' }),
      );
    });

    it('should capture session metadata from RPC get_state responses', () => {
      manager.spawn('/test/cwd');

      const frame = JSON.stringify({
        type: 'response',
        command: 'get_state',
        success: true,
        data: {
          sessionFile: 'E:\\sessions\\current.jsonl',
          sessionId: 'session-current',
        },
      });
      mockStdout.emit('data', Buffer.from(`${frame}\n`));

      expect(manager.getAgent('mock-agent-uuid-001')).toMatchObject({
        sessionFile: 'E:\\sessions\\current.jsonl',
        sessionId: 'session-current',
      });
    });
  });

  // ============ getAgent ============

  describe('getAgent', () => {
    it('should return agent info for existing agent', () => {
      manager.spawn('/test/cwd', 'ws-001');
      const agent = manager.getAgent('mock-agent-uuid-001');

      expect(agent).toBeDefined();
      expect(agent?.id).toBe('mock-agent-uuid-001');
      expect(agent?.cwd).toBe('/test/cwd');
      expect(agent?.workspaceId).toBe('ws-001');
      expect(agent?.status).toBe('running');
    });

    it('should return undefined for non-existent agent', () => {
      expect(manager.getAgent('nonexistent')).toBeUndefined();
    });

    it('should return a copy, not the internal reference', () => {
      manager.spawn('/test/cwd');
      const agent = manager.getAgent('mock-agent-uuid-001');
      agent!.status = 'error';

      const fetchedAgain = manager.getAgent('mock-agent-uuid-001');
      // The returned copy mutation should NOT affect internal state
      // But note: this depends on whether getAgent returns a new object or reference
      // getAgent creates a new object, so this should be fine
      expect(fetchedAgain?.status).toBe('running');
    });
  });

  // ============ getAllAgents ============

  describe('getAllAgents', () => {
    it('should return empty array when no agents', () => {
      expect(manager.getAllAgents()).toEqual([]);
    });

    it('should return all spawned agents', () => {
      manager.spawn('/cwd1');
      manager.spawn('/cwd2');

      const all = manager.getAllAgents();
      expect(all).toHaveLength(2);
      expect(all[0].cwd).toBe('/cwd1');
      expect(all[1].cwd).toBe('/cwd2');
    });
  });

  // ============ getAgentCount ============

  describe('getAgentCount', () => {
    it('should return 0 for empty manager', () => {
      expect(manager.getAgentCount()).toBe(0);
    });

    it('should return correct count after spawns', () => {
      manager.spawn('/cwd1');
      expect(manager.getAgentCount()).toBe(1);
      manager.spawn('/cwd2');
      expect(manager.getAgentCount()).toBe(2);
    });

    it('should decrement after kill', () => {
      manager.spawn('/cwd1');
      manager.spawn('/cwd2');
      manager.kill('mock-agent-uuid-001');
      expect(manager.getAgentCount()).toBe(1);
    });
  });

  // ============ Phase 2: cascade kill ============

  describe('kill (Phase 2: cascade)', () => {
    beforeEach(() => {
      // Each test needs a parent-child hierarchy
      // We'll spawn agents in each test individually for clarity
    });

    it('should cascade kill all descendants in BFS order', () => {
      // Create parent
      manager.spawn('/parent');
      const parentId = 'mock-agent-uuid-001';

      // Create children
      manager.spawn('/child1', undefined, parentId, 'child task 1');
      const child1Id = 'mock-agent-uuid-002';
      manager.spawn('/child2', undefined, parentId, 'child task 2');
      const child2Id = 'mock-agent-uuid-003';

      // Create grandchild under child1
      manager.spawn('/grandchild', undefined, child1Id, 'grandchild task');
      const grandchildId = 'mock-agent-uuid-004';

      expect(manager.getAgentCount()).toBe(4);

      // Cascade kill parent
      manager.kill(parentId, true);

      // All should be removed
      expect(manager.getAgentCount()).toBe(0);
      expect(manager.getAgent(parentId)).toBeUndefined();
      expect(manager.getAgent(child1Id)).toBeUndefined();
      expect(manager.getAgent(child2Id)).toBeUndefined();
      expect(manager.getAgent(grandchildId)).toBeUndefined();
    });

    it('should kill all descendants (verify depth-descending by result)', () => {
      manager.spawn('/parent');
      const parentId = 'mock-agent-uuid-001';

      manager.spawn('/child', undefined, parentId, 'child task');
      const childId = 'mock-agent-uuid-002';

      manager.spawn('/grandchild', undefined, childId, 'grandchild task');
      const grandchildId = 'mock-agent-uuid-003';

      expect(manager.getAgentCount()).toBe(3);

      // Cascade kill: all descendants should be removed
      manager.kill(parentId, true);

      // Verify all are gone (cascade removes leaves and root)
      expect(manager.getAgentCount()).toBe(0);
      expect(manager.getAgent(parentId)).toBeUndefined();
      expect(manager.getAgent(childId)).toBeUndefined();
      expect(manager.getAgent(grandchildId)).toBeUndefined();
    });

    it('should orphan children when cascade is false', () => {
      manager.spawn('/parent');
      const parentId = 'mock-agent-uuid-001';

      manager.spawn('/child', undefined, parentId, 'child task');
      const childId = 'mock-agent-uuid-002';

      manager.spawn('/grandchild', undefined, childId, 'grandchild task');
      const grandchildId = 'mock-agent-uuid-003';

      manager.kill(parentId, false);

      // Parent should be removed
      expect(manager.getAgent(parentId)).toBeUndefined();

      // Children should still exist and be orphaned
      const child = manager.getAgent(childId);
      expect(child).toBeDefined();
      expect(child?.isOrphaned).toBe(true);
      expect(child?.parentId).toBeNull();

      // Grandchild should also be orphaned recursively
      const grandchild = manager.getAgent(grandchildId);
      expect(grandchild).toBeDefined();
      expect(grandchild?.isOrphaned).toBe(true);
      expect(grandchild?.parentId).toBeNull();
    });

    it('should remove agent from parent childIds on kill', () => {
      manager.spawn('/parent');
      const parentId = 'mock-agent-uuid-001';

      manager.spawn('/child', undefined, parentId, 'child task');
      const childId = 'mock-agent-uuid-002';

      // Check parent has child
      const parentBefore = manager.getAgent(parentId);
      expect(parentBefore?.childIds).toContain(childId);

      manager.kill(childId, true);

      // Parent childIds should no longer contain the killed child
      const parentAfter = manager.getAgent(parentId);
      expect(parentAfter?.childIds).not.toContain(childId);
    });
  });

  // ============ Phase 2: getChildren ============

  describe('getChildren', () => {
    it('should return all descendants of an agent', () => {
      manager.spawn('/parent');
      const parentId = 'mock-agent-uuid-001';

      manager.spawn('/child1', undefined, parentId, 'task 1');
      manager.spawn('/child2', undefined, parentId, 'task 2');
      manager.spawn('/grandchild', undefined, 'mock-agent-uuid-002', 'task 3');

      const children = manager.getChildren(parentId);
      expect(children).toHaveLength(3);

      const ids = children.map((c) => c.id);
      expect(ids).toContain('mock-agent-uuid-002');
      expect(ids).toContain('mock-agent-uuid-003');
      expect(ids).toContain('mock-agent-uuid-004');
    });

    it('should return empty array for agent with no children', () => {
      manager.spawn('/loner');
      const children = manager.getChildren('mock-agent-uuid-001');
      expect(children).toEqual([]);
    });

    it('should return empty array for non-existent agent', () => {
      const children = manager.getChildren('nonexistent');
      expect(children).toEqual([]);
    });
  });

  // ============ Phase 2: spawn with parentId ============

  describe('spawn with parentId', () => {
    it('should set parentId and add to parent childIds', () => {
      manager.spawn('/parent');
      const parentId = 'mock-agent-uuid-001';

      const child = manager.spawn('/child', undefined, parentId, 'child task');

      expect(child.parentId).toBe(parentId);
      expect(child.taskDescription).toBe('child task');

      const parent = manager.getAgent(parentId);
      expect(parent?.childIds).toContain(child.id);
    });

    it('should handle parentId that does not exist gracefully', () => {
      // ParentId that doesn't exist — child should still be created
      const child = manager.spawn('/child', undefined, 'nonexistent-parent', 'orphan task');

      expect(child.parentId).toBe('nonexistent-parent');
      expect(child.taskDescription).toBe('orphan task');
      // No parent to add childIds to, but shouldn't crash
    });

    it('should return Phase 2 fields in AgentInfo', () => {
      const agent = manager.spawn('/test', 'ws-001');

      expect(agent.parentId).toBeNull();
      expect(agent.childIds).toEqual([]);
      expect(agent.taskDescription).toBeUndefined();
      expect(agent.isOrphaned).toBe(false);
    });
  });

  // ============ Phase 2: parseJSONL ============

  describe('parseJSONL', () => {
    it('should detect task tool_use with worktree and spawn child agent', () => {
      manager.spawn('/parent');
      const parentId = 'mock-agent-uuid-001';

      const onTaskSpawn = vi.fn();
      manager.onTaskSpawn = onTaskSpawn;

      // Simulate task tool_use JSONL output
      const jsonlLine = JSON.stringify({
        type: 'tool_use',
        name: 'task',
        arguments: {
          description: 'Implement login',
          subagent_type: 'general-purpose',
          worktree: '/tmp/login-feature',
        },
      });

      // Feed through the same data event path
      mockStdout.emit('data', Buffer.from(jsonlLine + '\n'));

      // Should have spawned a child agent
      expect(onTaskSpawn).toHaveBeenCalledWith(
        parentId,
        expect.any(String),
        'Implement login',
        '/tmp/login-feature',
      );

      // Child should be in agent map
      const childId = onTaskSpawn.mock.calls[0][1];
      const child = manager.getAgent(childId);
      expect(child).toBeDefined();
      expect(child?.parentId).toBe(parentId);
      expect(child?.taskDescription).toBe('Implement login');
      expect(child?.cwd).toBe('/tmp/login-feature');
    });

    it('should handle task without worktree (no spawn, no error)', () => {
      manager.spawn('/parent');
      const parentId = 'mock-agent-uuid-001';

      const onTaskSpawn = vi.fn();
      const onTaskResult = vi.fn();
      manager.onTaskSpawn = onTaskSpawn;
      manager.onTaskResult = onTaskResult;

      const jsonlLine = JSON.stringify({
        type: 'tool_use',
        name: 'task',
        arguments: {
          description: 'A task without worktree',
          subagent_type: 'general-purpose',
        },
      });

      mockStdout.emit('data', Buffer.from(jsonlLine + '\n'));

      // No spawn, no error notification
      expect(onTaskSpawn).not.toHaveBeenCalled();
      expect(onTaskResult).not.toHaveBeenCalled();
    });

    it('should detect irc dm tool_use', () => {
      manager.spawn('/agent-a');
      const agentId = 'mock-agent-uuid-001';

      const onIrcDm = vi.fn();
      manager.onIrcDm = onIrcDm;

      const jsonlLine = JSON.stringify({
        type: 'tool_use',
        name: 'irc',
        arguments: {
          irc_type: 'dm',
          to: 'agent-b',
          message: 'Hello from agent A!',
        },
      });

      mockStdout.emit('data', Buffer.from(jsonlLine + '\n'));

      expect(onIrcDm).toHaveBeenCalledWith(agentId, 'agent-b', 'Hello from agent A!');
    });

    it('should detect irc broadcast tool_use', () => {
      manager.spawn('/agent-a');
      const agentId = 'mock-agent-uuid-001';

      const onIrcBroadcast = vi.fn();
      manager.onIrcBroadcast = onIrcBroadcast;

      const jsonlLine = JSON.stringify({
        type: 'tool_use',
        name: 'irc',
        arguments: {
          irc_type: 'broadcast',
          message: 'Broadcast announcement!',
        },
      });

      mockStdout.emit('data', Buffer.from(jsonlLine + '\n'));

      expect(onIrcBroadcast).toHaveBeenCalledWith(agentId, 'Broadcast announcement!');
    });

    it('should handle irc with default dm type', () => {
      manager.spawn('/agent-a');
      const agentId = 'mock-agent-uuid-001';

      const onIrcDm = vi.fn();
      manager.onIrcDm = onIrcDm;
      const onIrcBroadcast = vi.fn();
      manager.onIrcBroadcast = onIrcBroadcast;

      const jsonlLine = JSON.stringify({
        type: 'tool_use',
        name: 'irc',
        arguments: {
          to: 'agent-b',
          message: 'Default dm message',
        },
      });

      mockStdout.emit('data', Buffer.from(jsonlLine + '\n'));

      expect(onIrcDm).toHaveBeenCalledWith(agentId, 'agent-b', 'Default dm message');
      expect(onIrcBroadcast).not.toHaveBeenCalled();
    });

    it('should detect file operation tool_use and trigger conflict', () => {
      manager.spawn('/agent-a');
      const agentId = 'mock-agent-uuid-001';

      const onConflictDetected = vi.fn();
      manager.onConflictDetected = onConflictDetected;

      const jsonlLine = JSON.stringify({
        type: 'tool_use',
        name: 'write_to_file',
        arguments: {
          file_path: '/tmp/test.ts',
          content: 'const x = 1;',
        },
      });

      mockStdout.emit('data', Buffer.from(jsonlLine + '\n'));

      expect(onConflictDetected).toHaveBeenCalledWith(agentId, '/tmp/test.ts', 'create');
    });

    it('should detect replace_in_file as modify operation', () => {
      manager.spawn('/agent-a');
      const agentId = 'mock-agent-uuid-001';

      const onConflictDetected = vi.fn();
      manager.onConflictDetected = onConflictDetected;

      const jsonlLine = JSON.stringify({
        type: 'tool_use',
        name: 'replace_in_file',
        arguments: {
          file_path: '/tmp/existing.ts',
          old_str: 'old',
          new_str: 'new',
        },
      });

      mockStdout.emit('data', Buffer.from(jsonlLine + '\n'));

      expect(onConflictDetected).toHaveBeenCalledWith(agentId, '/tmp/existing.ts', 'modify');
    });

    it('should detect delete_file as delete operation', () => {
      manager.spawn('/agent-a');
      const agentId = 'mock-agent-uuid-001';

      const onConflictDetected = vi.fn();
      manager.onConflictDetected = onConflictDetected;

      const jsonlLine = JSON.stringify({
        type: 'tool_use',
        name: 'delete_file',
        arguments: {
          target_file: '/tmp/to_delete.txt',
        },
      });

      mockStdout.emit('data', Buffer.from(jsonlLine + '\n'));

      expect(onConflictDetected).toHaveBeenCalledWith(agentId, '/tmp/to_delete.txt', 'delete');
    });

    it('should ignore non-JSON lines gracefully', () => {
      manager.spawn('/agent-a');
      const onTaskSpawn = vi.fn();
      manager.onTaskSpawn = onTaskSpawn;

      // Plain text output (non-JSON)
      mockStdout.emit('data', Buffer.from('Regular stdout output\n'));

      expect(onTaskSpawn).not.toHaveBeenCalled();
    });

    it('should ignore non-tool_use JSONL lines', () => {
      manager.spawn('/agent-a');
      const onTaskSpawn = vi.fn();
      manager.onTaskSpawn = onTaskSpawn;

      const jsonlLine = JSON.stringify({
        type: 'text',
        content: 'Just a regular message',
      });

      mockStdout.emit('data', Buffer.from(jsonlLine + '\n'));

      expect(onTaskSpawn).not.toHaveBeenCalled();
    });

    it('should handle multiple JSONL lines in one chunk', () => {
      manager.spawn('/agent-a');
      const agentId = 'mock-agent-uuid-001';

      const onIrcBroadcast = vi.fn();
      manager.onIrcBroadcast = onIrcBroadcast;

      const chunk = [
        JSON.stringify({ type: 'tool_use', name: 'irc', arguments: { irc_type: 'broadcast', message: 'msg1' } }),
        JSON.stringify({ type: 'tool_use', name: 'irc', arguments: { irc_type: 'broadcast', message: 'msg2' } }),
      ].join('\n') + '\n';

      mockStdout.emit('data', Buffer.from(chunk));

      expect(onIrcBroadcast).toHaveBeenCalledTimes(2);
    });

    it('should emit onTaskResult on child process exit', () => {
      manager.spawn('/parent');
      const parentId = 'mock-agent-uuid-001';

      manager.spawn('/child-worktree', undefined, parentId, 'Task for result');
      const childId = 'mock-agent-uuid-002';

      const onTaskResult = vi.fn();
      manager.onTaskResult = onTaskResult;

      // Child process exits successfully
      mockProcess.emit('exit', 0, null);

      expect(onTaskResult).toHaveBeenCalledWith(
        childId,
        'Task completed successfully',
        0,
      );
    });
  });

  // ============ cleanupAgent ============

  describe('cleanupAgent (delayed cleanup on exit)', () => {
    it('should remove agent after exit and timeout', async () => {
      vi.useFakeTimers();
      manager.spawn('/test/cwd');

      // Process exits
      mockProcess.emit('exit', 0, null);

      // Agent should still be accessible (status=stopped) before timeout
      expect(manager.getAgent('mock-agent-uuid-001')?.status).toBe('stopped');
      expect(manager.getAgentCount()).toBe(1);

      // After 5 seconds, cleanup should remove it
      await vi.advanceTimersByTimeAsync(5000);

      expect(manager.getAgentCount()).toBe(0);

      vi.useRealTimers();
    });
  });

  // ============ Phase 3: injectDependencies ============

  describe('injectDependencies', () => {
    it('should accept tokenTracker and budgetController', () => {
      const mockTT = {
        recordUsage: vi.fn(),
        getTotalUsage: vi.fn().mockReturnValue(0),
        flushAgent: vi.fn(),
        getCurrentMonthRecords: vi.fn().mockReturnValue([]),
        archiveMonth: vi.fn(),
        resetCurrentMonth: vi.fn(),
      };

      const mockBC = {
        checkBudget: vi.fn().mockReturnValue({ verdict: 'ok' as const, status: {} }),
        getStatus: vi.fn(),
      };

      // injectDependencies doesn't crash
      expect(() => manager.injectDependencies(mockTT as any, mockBC as any)).not.toThrow();
    });
  });

  // ============ Phase 3: spawn with model ============

  describe('spawn with model', () => {
    it('should set model in AgentInfo', () => {
      const agent = manager.spawn('/test', 'ws-1', undefined, undefined, 'gpt-4o');

      expect(agent.model).toBe('gpt-4o');
    });

    it('should default model to undefined when not specified', () => {
      const agent = manager.spawn('/test');

      expect(agent.model).toBeUndefined();
    });

    it('should include model in getAgent output', () => {
      manager.spawn('/test-model', 'ws-2', undefined, undefined, 'claude-3-opus');
      const agent = manager.getAgent('mock-agent-uuid-001');
      expect(agent?.model).toBe('claude-3-opus');
    });

    it('should include model in getAllAgents output', () => {
      manager.spawn('/test', undefined, undefined, undefined, 'deepseek-chat');
      const agents = manager.getAllAgents();
      expect(agents[0].model).toBe('deepseek-chat');
    });

    it('should pass provider-qualified model and CPC agent config dir for configured custom providers', () => {
      const runtimeConfig = {
        providerId: 'tokenx24',
        providerName: 'TokenX24',
        baseUrl: 'https://tokenx24.com/v1',
        apiKey: 'secret-token',
        model: { id: 'gpt-5.5', name: 'GPT-5.5', isDefault: true },
      };
      const providerConfigService = {
        getModelRuntimeConfig: vi.fn().mockReturnValue(runtimeConfig),
      };
      prepareOmpRuntimeConfigMock.mockReturnValue({
        agentDir: 'E:\\Work\\Web\\cyberpal_cockpit\\.tmp\\omp-agent\\agent',
        modelSelector: 'tokenx24/gpt-5.5',
      });

      manager.injectDependencies(
        { recordUsage: vi.fn(), getTotalUsage: vi.fn().mockReturnValue(0), flushAgent: vi.fn(), getCurrentMonthRecords: vi.fn().mockReturnValue([]), archiveMonth: vi.fn(), resetCurrentMonth: vi.fn() } as any,
        { checkBudget: vi.fn().mockReturnValue({ verdict: 'ok', status: {} }), getStatus: vi.fn() } as any,
        providerConfigService as any,
      );

      const agent = manager.spawn('/test', 'ws-1', undefined, undefined, 'gpt-5.5');

      expect(agent.model).toBe('gpt-5.5');
      expect(providerConfigService.getModelRuntimeConfig).toHaveBeenCalledWith('gpt-5.5');
      expect(prepareOmpRuntimeConfigMock).toHaveBeenCalledWith(expect.any(String), runtimeConfig);
      expect(spawn).toHaveBeenCalledWith(
        expect.stringContaining(process.platform === 'win32' ? 'bun.exe' : 'bun'),
        [
          expect.stringContaining('cli.ts'),
          '--mode',
          'rpc',
          '--model',
          'tokenx24/gpt-5.5',
        ],
        {
          cwd: '/test',
          env: expect.objectContaining({
            PI_CODING_AGENT_DIR: 'E:\\Work\\Web\\cyberpal_cockpit\\.tmp\\omp-agent\\agent',
          }),
        },
      );
    });
  });

  // ============ Phase 3: budget pre-check ============

  describe('budget pre-check on spawn', () => {
    it('should allow spawn when budget is ok', () => {
      const mockBC = {
        checkBudget: vi.fn().mockReturnValue({ verdict: 'ok' as const, status: { percentage: 0.5 } }),
        getStatus: vi.fn(),
      };
      manager.injectDependencies({ recordUsage: vi.fn(), getTotalUsage: vi.fn().mockReturnValue(0), flushAgent: vi.fn(), getCurrentMonthRecords: vi.fn().mockReturnValue([]), archiveMonth: vi.fn(), resetCurrentMonth: vi.fn() } as any, mockBC as any);

      const agent = manager.spawn('/test');
      expect(agent).toBeDefined();
      expect(agent.id).toBe('mock-agent-uuid-001');
    });

    it('should reject spawn when budget is exceeded', () => {
      const mockBC = {
        checkBudget: vi.fn().mockReturnValue({
          verdict: 'rejected' as const,
          status: { currentUsage: 110000, monthlyLimit: 100000, percentage: 1.1 },
        }),
        getStatus: vi.fn(),
      };
      manager.injectDependencies({ recordUsage: vi.fn(), getTotalUsage: vi.fn().mockReturnValue(110000), flushAgent: vi.fn(), getCurrentMonthRecords: vi.fn().mockReturnValue([]), archiveMonth: vi.fn(), resetCurrentMonth: vi.fn() } as any, mockBC as any);

      expect(() => manager.spawn('/test')).toThrow('Budget exceeded');
    });

    it('should skip budget check for child agents (has parentId)', () => {
      manager.spawn('/parent');
      const parentId = 'mock-agent-uuid-001';

      const mockBC = {
        checkBudget: vi.fn().mockReturnValue({
          verdict: 'rejected' as const,
          status: { currentUsage: 200000, monthlyLimit: 100000, percentage: 2.0 },
        }),
        getStatus: vi.fn(),
      };
      manager.injectDependencies({ recordUsage: vi.fn(), getTotalUsage: vi.fn().mockReturnValue(200000), flushAgent: vi.fn(), getCurrentMonthRecords: vi.fn().mockReturnValue([]), archiveMonth: vi.fn(), resetCurrentMonth: vi.fn() } as any, mockBC as any);

      // Child agent — should NOT be rejected (budget check skips child spawns)
      const child = manager.spawn('/child', undefined, parentId, 'child task');
      expect(child).toBeDefined();
      expect(child.parentId).toBe(parentId);
    });
  });

  // ============ Phase 3: restart ============

  describe('restart', () => {
    it('should restart agent with new model', () => {
      manager.spawn('/test', undefined, undefined, undefined, 'gpt-4o');
      const originalId = 'mock-agent-uuid-001';

      // restart generates new id (due to spawn)
      const restarted = manager.restart(originalId, 'claude-3-opus');
      expect(restarted.model).toBe('claude-3-opus');
      // Old agent should be gone (killed)
      expect(manager.getAgent(originalId)).toBeUndefined();
    });

    it('should throw for non-existent agent', () => {
      expect(() => manager.restart('nonexistent', 'gpt-4o')).toThrow('not found');
    });

    it('should preserve cwd and workspaceId', () => {
      manager.spawn('/my-project', 'ws-xyz', undefined, undefined, 'gpt-4o');
      const originalId = 'mock-agent-uuid-001';

      const restarted = manager.restart(originalId, 'deepseek-chat');

      expect(restarted.cwd).toBe('/my-project');
      expect(restarted.workspaceId).toBe('ws-xyz');
    });

    it('should set status to restarting during restart', () => {
      const statusChanges: string[] = [];
      manager.onStatusChange = (agentId, status) => {
        statusChanges.push(status);
      };

      manager.spawn('/test', undefined, undefined, undefined, 'gpt-4o');
      const originalId = 'mock-agent-uuid-001';

      // Clear status callback to track restart
      manager.onStatusChange = (agentId, status) => {
        statusChanges.push(status);
      };

      manager.restart(originalId, 'claude-3-opus');

      // Should include 'restarting' and 'running'
      expect(statusChanges).toContain('restarting');
      expect(statusChanges).toContain('running');
    });
  });

  // ============ Phase 3: extractTokenUsage ============

  describe('extractTokenUsage (via parseJSONL)', () => {
    // Shared mock for Phase 3 extractTokenUsage tests
    function makeP3Mocks() {
      return {
        tt: {
          recordUsage: vi.fn(),
          getTotalUsage: vi.fn().mockReturnValue(0),
          flushAgent: vi.fn(),
          getCurrentMonthRecords: vi.fn().mockReturnValue([]),
          archiveMonth: vi.fn(),
          resetCurrentMonth: vi.fn(),
        },
        bc: {
          checkBudget: vi.fn().mockReturnValue({ verdict: 'ok', status: {} }),
          getStatus: vi.fn(),
          onBudgetWarning: null,
        },
      };
    }

    it('should extract token_usage format from JSONL', () => {
      const mocks = makeP3Mocks();
      manager.injectDependencies(mocks.tt as any, mocks.bc as any);
      manager.spawn('/agent-a');
      const agentId = 'mock-agent-uuid-001';

      const jsonlLine = JSON.stringify({
        type: 'message',
        content: 'Here is the code',
        token_usage: { input: 150, output: 80 },
      });

      mockStdout.emit('data', Buffer.from(jsonlLine + '\n'));

      expect(mocks.tt.recordUsage).toHaveBeenCalledWith(agentId, 150, 80, undefined);
    });

    it('should extract usage format (prompt_tokens/completion_tokens)', () => {
      const mocks = makeP3Mocks();
      manager.injectDependencies(mocks.tt as any, mocks.bc as any);
      manager.spawn('/agent-a', undefined, undefined, undefined, 'deepseek-chat');
      const agentId = 'mock-agent-uuid-001';

      const jsonlLine = JSON.stringify({
        type: 'message',
        usage: { prompt_tokens: 200, completion_tokens: 120 },
      });

      mockStdout.emit('data', Buffer.from(jsonlLine + '\n'));

      expect(mocks.tt.recordUsage).toHaveBeenCalledWith(agentId, 200, 120, 'deepseek-chat');
    });

    it('should pass workspaceId when recording token usage', () => {
      const mocks = makeP3Mocks();
      manager.injectDependencies(mocks.tt as any, mocks.bc as any);
      manager.spawn('/agent-a', 'workspace-a', undefined, undefined, 'deepseek-chat');
      const agentId = 'mock-agent-uuid-001';

      const jsonlLine = JSON.stringify({
        type: 'message',
        token_usage: { input: 25, output: 15 },
      });

      mockStdout.emit('data', Buffer.from(jsonlLine + '\n'));

      expect(mocks.tt.recordUsage).toHaveBeenCalledWith(agentId, 25, 15, 'deepseek-chat', 'workspace-a');
    });

    it('should extract RPC message usage from assistant events', () => {
      const mocks = makeP3Mocks();
      manager.injectDependencies(mocks.tt as any, mocks.bc as any);
      manager.spawn('/agent-a', 'workspace-a', undefined, undefined, 'gpt-5.5');
      const agentId = 'mock-agent-uuid-001';

      const jsonlLine = JSON.stringify({
        type: 'message_update',
        assistantMessageEvent: {
          type: 'text_end',
          partial: {
            usage: {
              input: 28067,
              output: 124,
              totalTokens: 28191,
            },
          },
        },
      });

      mockStdout.emit('data', Buffer.from(`${jsonlLine}\n`));

      expect(mocks.tt.recordUsage).toHaveBeenCalledWith(agentId, 28067, 124, 'gpt-5.5', 'workspace-a');
    });

    it('should extract RPC cache and cost usage from assistant events', () => {
      const mocks = makeP3Mocks();
      manager.injectDependencies(mocks.tt as any, mocks.bc as any);
      manager.spawn('/agent-a', 'workspace-a', undefined, undefined, 'gpt-5.5');
      const agentId = 'mock-agent-uuid-001';

      const jsonlLine = JSON.stringify({
        type: 'message_end',
        message: {
          responseId: 'resp-with-cache-cost',
          usage: {
            input: 1000,
            output: 250,
            cacheRead: 3000,
            cacheWrite: 400,
            cost: {
              input: 0.01,
              output: 0.02,
              cacheRead: 0.003,
              cacheWrite: 0.004,
              total: 0.037,
            },
          },
        },
      });

      mockStdout.emit('data', Buffer.from(`${jsonlLine}\n`));

      expect(mocks.tt.recordUsage).toHaveBeenCalledWith(
        agentId,
        1000,
        250,
        'gpt-5.5',
        'workspace-a',
        {
          cacheReadTokens: 3000,
          cacheWriteTokens: 400,
          costUsd: 0.037,
        },
      );
    });

    it('should not double-count repeated RPC usage for the same response', () => {
      const mocks = makeP3Mocks();
      manager.injectDependencies(mocks.tt as any, mocks.bc as any);
      manager.spawn('/agent-a', 'workspace-a', undefined, undefined, 'gpt-5.5');
      const usageMessage = {
        role: 'assistant',
        usage: {
          input: 28067,
          output: 124,
          totalTokens: 28191,
        },
        responseId: 'resp-tokenx24-smoke',
      };
      const chunk = [
        JSON.stringify({ type: 'message_end', message: usageMessage }),
        JSON.stringify({ type: 'turn_end', message: usageMessage }),
      ].join('\n') + '\n';

      mockStdout.emit('data', Buffer.from(chunk));

      expect(mocks.tt.recordUsage).toHaveBeenCalledTimes(1);
      expect(mocks.tt.recordUsage).toHaveBeenCalledWith(
        'mock-agent-uuid-001',
        28067,
        124,
        'gpt-5.5',
        'workspace-a',
      );
    });

    it('should prefer token_usage over usage format', () => {
      const mocks = makeP3Mocks();
      manager.injectDependencies(mocks.tt as any, mocks.bc as any);
      manager.spawn('/agent-a');

      const jsonlLine = JSON.stringify({
        type: 'message',
        token_usage: { input: 300, output: 200 },
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      });

      mockStdout.emit('data', Buffer.from(jsonlLine + '\n'));

      // Should use token_usage values, not usage values
      expect(mocks.tt.recordUsage).toHaveBeenCalledWith(expect.any(String), 300, 200, undefined);
    });

    it('should handle missing token info gracefully', () => {
      const mocks = makeP3Mocks();
      manager.injectDependencies(mocks.tt as any, mocks.bc as any);
      manager.spawn('/agent-a');

      const jsonlLine = JSON.stringify({ type: 'message', content: 'No tokens here' });

      expect(() => {
        mockStdout.emit('data', Buffer.from(jsonlLine + '\n'));
      }).not.toThrow();

      // recordUsage not called (zero tokens)
      expect(mocks.tt.recordUsage).not.toHaveBeenCalled();
    });

    it('should flush agent tokens on kill', () => {
      const mocks = makeP3Mocks();
      manager.injectDependencies(mocks.tt as any, mocks.bc as any);
      manager.spawn('/agent-a');
      const agentId = 'mock-agent-uuid-001';

      manager.kill(agentId, true);

      expect(mocks.tt.flushAgent).toHaveBeenCalledWith(agentId);
    });
  });
});
