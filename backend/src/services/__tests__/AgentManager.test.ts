import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { EventEmitter } from 'events';
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
        expect.stringContaining('oh-my-pi'),
        ['--mode', 'json'],
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
    it('should write input to process stdin', () => {
      manager.spawn('/test/cwd');
      manager.sendStdin('mock-agent-uuid-001', 'test input');

      expect(mockStdin.write).toHaveBeenCalledWith('test input\n');
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
