import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAgents } from '../useAgents';
import type { AgentInfo, CreateAgentResponse } from '@/types';

// Mock API — all definitions must be inline because vi.mock is hoisted
vi.mock('@/services/api', () => ({
  fetchAgents: vi.fn(),
  fetchAgentEvents: vi.fn(),
  createAgent: vi.fn(),
  deleteAgent: vi.fn(),
  sendStdin: vi.fn(),
  restartAgent: vi.fn(),
}));

// Import the mocked module to access mock functions
import * as mockApi from '@/services/api';

describe('useAgents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockAgentInfo = (overrides: Partial<AgentInfo> = {}): AgentInfo => ({
    id: 'agent-test-1',
    cwd: '/test/cwd',
    status: 'running',
    pid: 12345,
    workspaceId: null,
    createdAt: Date.now(),
    parentId: null,
    childIds: [],
    isOrphaned: false,
    ...overrides,
  });

  // Helper for creating full AgentInfo objects
  function createMockAgent(id: string): AgentInfo {
    return mockAgentInfo({ id });
  }

  // ============ createAgent ============

  describe('createAgent', () => {
    it('should create an agent and add to state', async () => {
      const response: CreateAgentResponse = { agent: mockAgentInfo() };
      (mockApi.createAgent as ReturnType<typeof vi.fn>).mockResolvedValue(response);

      const { createAgent, agents, terminalOutputs, markdownOutputs } = useAgents();
      const result = await createAgent('/test/cwd');

      expect(result).toEqual(response.agent);
      expect(agents.value.get('agent-test-1')).toEqual(response.agent);
      expect(terminalOutputs.value.get('agent-test-1')).toBe('');
      expect(markdownOutputs.value.get('agent-test-1')).toBe('');
      expect(mockApi.createAgent).toHaveBeenCalledWith({
        cwd: '/test/cwd',
        workspaceId: undefined,
      });
    });

    it('should create agent with workspaceId', async () => {
      const agent = mockAgentInfo({ workspaceId: 'ws-001' });
      (mockApi.createAgent as ReturnType<typeof vi.fn>).mockResolvedValue({ agent });

      const { createAgent } = useAgents();
      await createAgent('/test/cwd', 'ws-001');

      expect(mockApi.createAgent).toHaveBeenCalledWith({
        cwd: '/test/cwd',
        workspaceId: 'ws-001',
      });
    });

    it('should add multiple agents', async () => {
      (mockApi.createAgent as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ agent: mockAgentInfo({ id: 'agent-1' }) })
        .mockResolvedValueOnce({ agent: mockAgentInfo({ id: 'agent-2', cwd: '/cwd2' }) });

      const { createAgent, agentList } = useAgents();

      await createAgent('/cwd1');
      await createAgent('/cwd2');

      expect(agentList.value).toHaveLength(2);
      expect(agentList.value.map((a) => a.id)).toEqual(['agent-1', 'agent-2']);
    });

    it('should expose create errors for visible launcher feedback', async () => {
      const error = {
        response: {
          data: {
            message: 'Budget exceeded: 100 / 100 tokens used',
          },
        },
      };
      (mockApi.createAgent as ReturnType<typeof vi.fn>).mockRejectedValue(error);

      const { createAgent, launchError } = useAgents();

      await expect(createAgent('/budget-blocked')).rejects.toBe(error);
      expect(launchError.value).toBe('Budget exceeded: 100 / 100 tokens used');
    });
  });

  // ============ agentList computed ============

  describe('agentList', () => {
    it('should be empty initially', () => {
      const { agentList } = useAgents();
      expect(agentList.value).toEqual([]);
    });

    it('should reflect current agents after creation', async () => {
      (mockApi.createAgent as ReturnType<typeof vi.fn>).mockResolvedValue({ agent: mockAgentInfo() });

      const { createAgent, agentList } = useAgents();
      await createAgent('/test');

      expect(agentList.value).toHaveLength(1);
      expect(agentList.value[0].id).toBe('agent-test-1');
    });
  });

  // ============ loadAgents / persisted events ============

  describe('loadAgents', () => {
    it('should load agents and rebuild outputs from persisted conversation events', async () => {
      (mockApi.fetchAgents as ReturnType<typeof vi.fn>).mockResolvedValue([
        mockAgentInfo({ id: 'agent-1', cwd: '/persisted' }),
      ]);
      (mockApi.fetchAgentEvents as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'evt-1',
          agentId: 'agent-1',
          kind: 'user',
          title: 'User',
          content: 'Say ok',
          status: 'completed',
          createdAt: 1,
        },
        {
          id: 'evt-2',
          agentId: 'agent-1',
          kind: 'assistant',
          title: 'Assistant',
          content: 'OK',
          status: 'completed',
          createdAt: 2,
        },
      ]);

      const { loadAgents, agents, conversationEvents, terminalOutputs, markdownOutputs } = useAgents();

      await loadAgents();

      expect(agents.value.has('agent-1')).toBe(true);
      expect(mockApi.fetchAgentEvents).toHaveBeenCalledWith('agent-1');
      expect(conversationEvents.value.get('agent-1')).toHaveLength(2);
      expect(terminalOutputs.value.get('agent-1')).toContain('> Say ok');
      expect(terminalOutputs.value.get('agent-1')).toContain('OK');
      expect(markdownOutputs.value.get('agent-1')).toContain('> Say ok');
    });

    it('should append a websocket conversation event without duplicating existing event ids', () => {
      const { appendConversationEvent, conversationEvents } = useAgents();
      const event = {
        id: 'evt-1',
        agentId: 'agent-1',
        kind: 'working' as const,
        title: 'Working',
        content: 'Agent is processing the request.',
        status: 'running' as const,
        createdAt: 1,
      };

      appendConversationEvent(event);
      appendConversationEvent(event);

      expect(conversationEvents.value.get('agent-1')).toEqual([event]);
    });

    it('should not append duplicate event text to terminal or formal markdown outputs', () => {
      const { appendConversationEvent, conversationEvents, terminalOutputs, markdownOutputs } = useAgents();
      const event = {
        id: 'evt-1',
        agentId: 'agent-1',
        kind: 'assistant' as const,
        title: 'Assistant',
        content: 'Only once',
        status: 'running' as const,
        createdAt: 1,
      };

      appendConversationEvent(event);
      appendConversationEvent(event);

      expect(conversationEvents.value.get('agent-1')).toEqual([event]);
      expect(terminalOutputs.value.get('agent-1')).toBe('Only once');
      expect(markdownOutputs.value.get('agent-1')).toBe('Only once');
    });

    it('should rebuild formal markdown from assistant content without thinking or tool details', () => {
      (mockApi.fetchAgents as ReturnType<typeof vi.fn>).mockResolvedValue([
        mockAgentInfo({ id: 'agent-1', cwd: '/persisted' }),
      ]);
      (mockApi.fetchAgentEvents as ReturnType<typeof vi.fn>).mockResolvedValue([
        {
          id: 'evt-1',
          agentId: 'agent-1',
          kind: 'thinking',
          title: 'Thinking',
          content: 'Private analysis',
          status: 'completed',
          createdAt: 1,
        },
        {
          id: 'evt-2',
          agentId: 'agent-1',
          kind: 'tool',
          title: 'shell_command',
          content: 'npm test',
          status: 'completed',
          createdAt: 2,
        },
        {
          id: 'evt-3',
          agentId: 'agent-1',
          kind: 'assistant',
          title: 'Assistant',
          content: 'Formal answer',
          status: 'completed',
          createdAt: 3,
        },
      ]);

      const { loadAgents, terminalOutputs, markdownOutputs } = useAgents();

      return loadAgents().then(() => {
        expect(terminalOutputs.value.get('agent-1')).toContain('Private analysis');
        expect(terminalOutputs.value.get('agent-1')).toContain('npm test');
        expect(markdownOutputs.value.get('agent-1')).toBe('Formal answer');
      });
    });
  });

  // ============ killAgent ============

  describe('killAgent', () => {
    it('should delete agent via API and remove from state', async () => {
      (mockApi.createAgent as ReturnType<typeof vi.fn>).mockResolvedValue({ agent: mockAgentInfo() });
      (mockApi.deleteAgent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const { createAgent, killAgent, agents, terminalOutputs, markdownOutputs } = useAgents();
      await createAgent('/test');

      await killAgent('agent-test-1');

      expect(mockApi.deleteAgent).toHaveBeenCalledWith('agent-test-1', true);
      expect(agents.value.has('agent-test-1')).toBe(false);
      expect(terminalOutputs.value.has('agent-test-1')).toBe(false);
      expect(markdownOutputs.value.has('agent-test-1')).toBe(false);
    });
  });

  // ============ sendStdin ============

  describe('sendStdin', () => {
    it('should send stdin via API', () => {
      (mockApi.sendStdin as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const { sendStdin } = useAgents();
      sendStdin('agent-1', 'test input');

      expect(mockApi.sendStdin).toHaveBeenCalledWith('agent-1', 'test input');
    });

    it('should immediately append user input to cell outputs before the API resolves', async () => {
      let resolveSend: (() => void) | undefined;
      (mockApi.sendStdin as ReturnType<typeof vi.fn>).mockReturnValue(
        new Promise<void>((resolve) => {
          resolveSend = resolve;
        }),
      );

      const { agents, terminalOutputs, markdownOutputs, conversationEvents, sendStates, sendStdin } = useAgents();
      agents.value.set('agent-1', createMockAgent('agent-1'));
      terminalOutputs.value.set('agent-1', '');
      markdownOutputs.value.set('agent-1', '');

      sendStdin('agent-1', 'Build the feature');

      expect(terminalOutputs.value.get('agent-1')).toBe('\r\n> Build the feature\r\n');
      expect(markdownOutputs.value.get('agent-1')).toBe('\n> Build the feature\n\n');

      resolveSend?.();
      await vi.waitFor(() => {
        expect(mockApi.sendStdin).toHaveBeenCalledWith('agent-1', 'Build the feature');
      });
    });

    it('should immediately append user input to the process conversation', () => {
      (mockApi.sendStdin as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const { agents, conversationEvents, sendStdin } = useAgents();
      agents.value.set('agent-1', createMockAgent('agent-1'));
      conversationEvents.value.set('agent-1', []);

      sendStdin('agent-1', 'Build the feature');

      expect(conversationEvents.value.get('agent-1')).toMatchObject([
        {
          agentId: 'agent-1',
          kind: 'user',
          title: 'User',
          content: 'Build the feature',
          status: 'completed',
        },
      ]);
    });

    it('should expose sending and busy feedback around stdin requests', async () => {
      let resolveSend: (() => void) | undefined;
      (mockApi.sendStdin as ReturnType<typeof vi.fn>).mockReturnValue(
        new Promise<void>((resolve) => {
          resolveSend = resolve;
        }),
      );

      const { agents, conversationEvents, sendStates, sendStdin } = useAgents();
      agents.value.set('agent-1', createMockAgent('agent-1'));
      conversationEvents.value.set('agent-1', []);

      sendStdin('agent-1', 'Build the feature');

      expect(sendStates.value.get('agent-1')).toMatchObject({
        phase: 'sending',
        message: '正在发送...',
      });

      resolveSend?.();

      await vi.waitFor(() => {
        expect(sendStates.value.get('agent-1')).toMatchObject({
          phase: 'busy',
          message: '等待 Agent 响应...',
        });
      });
    });

    it('should update send feedback from streamed process events and clear it after final assistant output', () => {
      (mockApi.sendStdin as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const { conversationEvents, sendStates, appendConversationEvent } = useAgents();
      conversationEvents.value.set('agent-1', []);

      appendConversationEvent({
        id: 'thinking-1',
        agentId: 'agent-1',
        kind: 'thinking',
        title: 'Thinking',
        content: 'checking files',
        status: 'running',
        createdAt: 1,
      }, false);

      expect(sendStates.value.get('agent-1')).toMatchObject({
        phase: 'busy',
        message: '正在思考...',
      });

      appendConversationEvent({
        id: 'tool-1',
        agentId: 'agent-1',
        kind: 'tool',
        title: 'shell_command',
        content: 'npm test',
        status: 'running',
        createdAt: 2,
      }, false);

      expect(sendStates.value.get('agent-1')).toMatchObject({
        phase: 'busy',
        message: '正在调用工具：shell_command',
      });

      appendConversationEvent({
        id: 'assistant-final',
        agentId: 'agent-1',
        kind: 'assistant',
        title: 'Assistant',
        content: 'Done',
        status: 'completed',
        createdAt: 3,
      }, false);

      expect(sendStates.value.has('agent-1')).toBe(false);
    });

    it('should deduplicate the backend user event that confirms an optimistic send', () => {
      (mockApi.sendStdin as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const { agents, conversationEvents, sendStdin, appendConversationEvent } = useAgents();
      agents.value.set('agent-1', createMockAgent('agent-1'));
      conversationEvents.value.set('agent-1', []);

      sendStdin('agent-1', 'Build the feature');

      appendConversationEvent({
        id: 'server-user-1',
        agentId: 'agent-1',
        kind: 'user',
        title: 'User',
        content: 'Build the feature',
        status: 'completed',
        createdAt: Date.now() + 25,
      }, false);

      expect(conversationEvents.value.get('agent-1')).toHaveLength(1);
    });

    it('should keep user input before streamed agent output', () => {
      (mockApi.sendStdin as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const { agents, terminalOutputs, markdownOutputs, sendStdin, appendOutput } = useAgents();
      agents.value.set('agent-1', createMockAgent('agent-1'));
      terminalOutputs.value.set('agent-1', '');
      markdownOutputs.value.set('agent-1', '');

      sendStdin('agent-1', 'Say ok');
      appendOutput('agent-1', 'O');
      appendOutput('agent-1', 'K');

      expect(terminalOutputs.value.get('agent-1')).toBe('\r\n> Say ok\r\nOK');
      expect(markdownOutputs.value.get('agent-1')).toBe('\n> Say ok\n\nOK');
    });

    it('should handle API sendStdin errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (mockApi.sendStdin as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Send failed'));

      const { agents, terminalOutputs, markdownOutputs, conversationEvents, sendStates, sendStdin } = useAgents();
      agents.value.set('agent-1', createMockAgent('agent-1'));
      terminalOutputs.value.set('agent-1', '');
      markdownOutputs.value.set('agent-1', '');

      expect(() => sendStdin('agent-1', 'input')).not.toThrow();

      await vi.waitFor(() => {
        expect(consoleSpy).toHaveBeenCalled();
      });

      expect(terminalOutputs.value.get('agent-1')).toContain('[发送失败] Send failed');
      expect(markdownOutputs.value.get('agent-1')).toContain('发送失败：Send failed');
      expect(conversationEvents.value.get('agent-1')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            agentId: 'agent-1',
            kind: 'stderr',
            title: '发送失败',
            content: 'Send failed',
            status: 'error',
          }),
        ]),
      );
      expect(sendStates.value.get('agent-1')).toMatchObject({
        phase: 'error',
        message: 'Send failed',
      });

      consoleSpy.mockRestore();
    });

    it('should update a persisted stopped agent when sendStdin resumes it', async () => {
      (mockApi.sendStdin as ReturnType<typeof vi.fn>).mockResolvedValue({
        agent: mockAgentInfo({
          id: 'agent-1',
          status: 'running',
          pid: 456,
          sessionFile: 'E:\\sessions\\old.jsonl',
          sessionId: 'session-old',
        }),
      });

      const { agents, terminalOutputs, markdownOutputs, sendStdin } = useAgents();
      agents.value.set('agent-1', mockAgentInfo({ id: 'agent-1', status: 'stopped', pid: null }));
      terminalOutputs.value.set('agent-1', '');
      markdownOutputs.value.set('agent-1', '');

      sendStdin('agent-1', 'continue');

      await vi.waitFor(() => {
        expect(agents.value.get('agent-1')).toMatchObject({
          status: 'running',
          pid: 456,
          sessionFile: 'E:\\sessions\\old.jsonl',
          sessionId: 'session-old',
        });
      });
    });
  });

  // ============ getAgent ============

  describe('getAgent', () => {
    it('should return computed ref for existing agent', async () => {
      (mockApi.createAgent as ReturnType<typeof vi.fn>).mockResolvedValue({ agent: mockAgentInfo() });

      const { createAgent, getAgent } = useAgents();
      await createAgent('/test');

      const agentRef = getAgent('agent-test-1');
      expect(agentRef.value).toBeDefined();
      expect(agentRef.value?.cwd).toBe('/test/cwd');
    });

    it('should return undefined for non-existent agent', () => {
      const { getAgent } = useAgents();
      const agentRef = getAgent('nonexistent');
      expect(agentRef.value).toBeUndefined();
    });
  });

  // ============ appendOutput ============

  describe('appendOutput', () => {
    it('should append to terminal output', async () => {
      (mockApi.createAgent as ReturnType<typeof vi.fn>).mockResolvedValue({ agent: mockAgentInfo() });

      const { createAgent, appendOutput, terminalOutputs, markdownOutputs } = useAgents();
      await createAgent('/test');

      appendOutput('agent-test-1', 'Hello ');
      expect(terminalOutputs.value.get('agent-test-1')).toBe('Hello ');

      appendOutput('agent-test-1', 'World!');
      expect(terminalOutputs.value.get('agent-test-1')).toBe('Hello World!');
    });

    it('should also accumulate to markdown output', async () => {
      (mockApi.createAgent as ReturnType<typeof vi.fn>).mockResolvedValue({ agent: mockAgentInfo() });

      const { createAgent, appendOutput, markdownOutputs } = useAgents();
      await createAgent('/test');

      appendOutput('agent-test-1', '# Title\n');
      appendOutput('agent-test-1', 'Content.');

      expect(markdownOutputs.value.get('agent-test-1')).toBe('# Title\nContent.');
    });
  });

  // ============ updateStatus ============

  describe('updateStatus', () => {
    it('should update agent status', async () => {
      (mockApi.createAgent as ReturnType<typeof vi.fn>).mockResolvedValue({ agent: mockAgentInfo() });

      const { createAgent, updateStatus, agents } = useAgents();
      await createAgent('/test');

      updateStatus('agent-test-1', 'error');
      expect(agents.value.get('agent-test-1')?.status).toBe('error');

      updateStatus('agent-test-1', 'stopped');
      expect(agents.value.get('agent-test-1')?.status).toBe('stopped');

      updateStatus('agent-test-1', 'running');
      expect(agents.value.get('agent-test-1')?.status).toBe('running');
    });

    it('should not throw for non-existent agent', () => {
      const { updateStatus } = useAgents();
      expect(() => updateStatus('nonexistent', 'error')).not.toThrow();
    });
  });

  // ============ clearOutput ============

  describe('clearOutput', () => {
    it('should clear both terminal and markdown outputs', async () => {
      (mockApi.createAgent as ReturnType<typeof vi.fn>).mockResolvedValue({ agent: mockAgentInfo() });

      const { createAgent, appendOutput, clearOutput, terminalOutputs, markdownOutputs } = useAgents();
      await createAgent('/test');

      appendOutput('agent-test-1', 'Some output');
      expect(terminalOutputs.value.get('agent-test-1')).toBe('Some output');
      expect(markdownOutputs.value.get('agent-test-1')).toBe('Some output');

      clearOutput('agent-test-1');

      expect(terminalOutputs.value.get('agent-test-1')).toBe('');
      expect(markdownOutputs.value.get('agent-test-1')).toBe('');
    });
  });

  // ============ Phase 2: handleTaskSpawn ============

  describe('handleTaskSpawn', () => {
    it('should add child agent to the agents map', () => {
      const { handleTaskSpawn, agents, terminalOutputs, markdownOutputs } = useAgents();

      handleTaskSpawn({
        parentId: 'parent-1',
        childId: 'child-1',
        taskDescription: 'Build feature X',
        cwd: '/tmp/feature',
      });

      const child = agents.value.get('child-1');
      expect(child).toBeDefined();
      expect(child!.id).toBe('child-1');
      expect(child!.parentId).toBe('parent-1');
      expect(child!.taskDescription).toBe('Build feature X');
      expect(child!.cwd).toBe('/tmp/feature');
      expect(child!.status).toBe('running');
      expect(child!.isOrphaned).toBe(false);
      expect(child!.childIds).toEqual([]);
      expect(terminalOutputs.value.get('child-1')).toBe('');
      expect(markdownOutputs.value.get('child-1')).toBe('');
    });

    it('should update parent childIds', () => {
      // Pre-populate parent
      const { agents, handleTaskSpawn } = useAgents();
      agents.value.set('parent-1', {
        id: 'parent-1', cwd: '/parent', status: 'running', pid: null,
        workspaceId: null, createdAt: Date.now(),
        parentId: null, childIds: ['existing-child'], isOrphaned: false,
      });

      handleTaskSpawn({
        parentId: 'parent-1',
        childId: 'new-child',
        taskDescription: 'New task',
        cwd: '/tmp/new',
      });

      const parent = agents.value.get('parent-1');
      expect(parent!.childIds).toContain('new-child');
      expect(parent!.childIds).toContain('existing-child'); // not overwritten
    });

    it('should not duplicate childId in parent childIds', () => {
      const { agents, handleTaskSpawn } = useAgents();
      agents.value.set('parent-1', {
        id: 'parent-1', cwd: '/p', status: 'running', pid: null,
        workspaceId: null, createdAt: Date.now(),
        parentId: null, childIds: ['child-1'], isOrphaned: false,
      });

      handleTaskSpawn({ parentId: 'parent-1', childId: 'child-1', taskDescription: 'Dup', cwd: '/tmp' });

      const parent = agents.value.get('parent-1');
      expect(parent!.childIds.filter((id) => id === 'child-1')).toHaveLength(1);
    });

    it('should handle non-existent parent gracefully', () => {
      const { handleTaskSpawn, agents } = useAgents();

      expect(() => {
        handleTaskSpawn({
          parentId: 'non-existent',
          childId: 'orphan-child',
          taskDescription: 'Orphan task',
          cwd: '/tmp/orphan',
        });
      }).not.toThrow();

      expect(agents.value.get('orphan-child')).toBeDefined();
    });
  });

  // ============ Phase 2: handleTaskResult ============

  describe('handleTaskResult', () => {
    it('should append result to terminal output', () => {
      const { agents, terminalOutputs, handleTaskResult } = useAgents();
      agents.value.set('child-1', {
        id: 'child-1', cwd: '/c', status: 'running', pid: null,
        workspaceId: null, createdAt: Date.now(),
        parentId: 'parent-1', childIds: [], isOrphaned: false,
      });

      handleTaskResult({ childId: 'child-1', result: 'Success!', tokenCost: 42 });

      const output = terminalOutputs.value.get('child-1');
      expect(output).toContain('[Task Result]');
      expect(output).toContain('Success!');
      expect(output).toContain('42');
    });

    it('should not throw for non-existent agent', () => {
      const { handleTaskResult } = useAgents();
      expect(() => {
        handleTaskResult({ childId: 'ghost', result: 'Gone', tokenCost: 0 });
      }).not.toThrow();
    });
  });

  // ============ Phase 2: handleConflict ============

  describe('handleConflict', () => {
    it('should add conflict notification', () => {
      const { handleConflict, conflicts, terminalOutputs, agents } = useAgents();
      // Pre-populate both agents
      agents.value.set('agent-a', createMockAgent('agent-a'));
      agents.value.set('agent-b', createMockAgent('agent-b'));
      terminalOutputs.value.set('agent-a', '');
      terminalOutputs.value.set('agent-b', '');

      const event = {
        filePath: '/shared/file.ts',
        agentA: 'agent-a',
        agentB: 'agent-b',
        operationA: 'modify',
        operationB: 'create',
        detectedAt: Date.now(),
      };

      handleConflict(event);

      expect(conflicts.value).toHaveLength(1);
      expect(conflicts.value[0].event).toEqual(event);
      expect(conflicts.value[0].dismissed).toBe(false);
      expect(conflicts.value[0].id).toBeDefined();
    });

    it('should cap conflicts at 20', () => {
      const { handleConflict, conflicts, agents, terminalOutputs } = useAgents();
      agents.value.set('a', createMockAgent('a'));
      agents.value.set('b', createMockAgent('b'));
      terminalOutputs.value.set('a', '');
      terminalOutputs.value.set('b', '');

      for (let i = 0; i < 25; i++) {
        handleConflict({
          filePath: `/file-${i}.ts`,
          agentA: 'a',
          agentB: 'b',
          operationA: 'modify',
          operationB: 'create',
          detectedAt: Date.now() + i,
        });
      }

      expect(conflicts.value.length).toBeLessThanOrEqual(20);
      // Latest conflicts should be at the front
      expect(conflicts.value[0].event.filePath).toBe('/file-24.ts');
    });
  });

  // ============ Phase 2: dismissConflict / activeConflicts ============

  describe('dismissConflict and activeConflicts', () => {
    it('should mark conflict as dismissed', () => {
      const { handleConflict, dismissConflict, conflicts, activeConflicts, agents, terminalOutputs } = useAgents();
      agents.value.set('a', createMockAgent('a'));
      agents.value.set('b', createMockAgent('b'));
      terminalOutputs.value.set('a', '');
      terminalOutputs.value.set('b', '');

      handleConflict({
        filePath: '/f.ts', agentA: 'a', agentB: 'b',
        operationA: 'modify', operationB: 'create', detectedAt: Date.now(),
      });

      const id = conflicts.value[0].id;
      expect(activeConflicts.value).toHaveLength(1);

      dismissConflict(id);
      expect(activeConflicts.value).toHaveLength(0);
      expect(conflicts.value[0].dismissed).toBe(true);
    });

    it('should not throw for invalid conflict id', () => {
      const { dismissConflict } = useAgents();
      expect(() => dismissConflict('invalid')).not.toThrow();
    });
  });

  // ============ Phase 2: killAgent removes related conflicts ============

  describe('killAgent (Phase 2: conflict cleanup)', () => {
    it('should remove conflicts related to killed agent', async () => {
      (mockApi.createAgent as ReturnType<typeof vi.fn>).mockResolvedValue({ agent: mockAgentInfo() });
      (mockApi.deleteAgent as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const { createAgent, killAgent, handleConflict, conflicts, agents, terminalOutputs } = useAgents();
      await createAgent('/test'); // id: agent-test-1
      agents.value.set('other', createMockAgent('other'));
      terminalOutputs.value.set('other', '');

      handleConflict({
        filePath: '/f.ts', agentA: 'agent-test-1', agentB: 'other',
        operationA: 'modify', operationB: 'create', detectedAt: Date.now(),
      });
      handleConflict({
        filePath: '/f2.ts', agentA: 'other', agentB: 'agent-test-1',
        operationA: 'modify', operationB: 'create', detectedAt: Date.now(),
      });

      expect(conflicts.value).toHaveLength(2);

      await killAgent('agent-test-1', true);

      // Both conflicts involve agent-test-1, should be removed
      expect(conflicts.value).toHaveLength(0);
    });
  });

  // ============ Phase 2: handleIrc ============

  describe('handleIrc', () => {
    it('should not throw when called', () => {
      const { handleIrc } = useAgents();
      expect(() => {
        handleIrc({ from: 'agent-1', message: 'Hello', type: 'dm' });
      }).not.toThrow();
    });
  });

  // ============ Phase 3: createAgent with model ============

  describe('createAgent with model', () => {
    it('should pass model parameter to API', async () => {
      (mockApi.createAgent as ReturnType<typeof vi.fn>).mockResolvedValue({
        agent: mockAgentInfo({ model: 'gpt-4o' }),
      });

      const { createAgent } = useAgents();
      await createAgent('/test', undefined, 'gpt-4o');

      expect(mockApi.createAgent).toHaveBeenCalledWith({
        cwd: '/test',
        model: 'gpt-4o',
      });
    });
  });

  // ============ Phase 3: restartAgent ============

  describe('restartAgent', () => {
    it('should set agent status to restarting before API call', async () => {
      const { agents, restartAgent } = useAgents();
      agents.value.set('agent-1', mockAgentInfo({ id: 'agent-1', model: 'gpt-4o' }));

      // Don't actually call API — just check status
      const restartPromise = restartAgent('agent-1', 'claude-3-opus');
      expect(agents.value.get('agent-1')?.status).toBe('restarting');

      // Clean up
      try { await restartPromise; } catch { /* ignore */ }
    });

    it('should update agent on successful restart', async () => {
      const updatedAgent = mockAgentInfo({ id: 'agent-1', model: 'claude-3-opus', cwd: '/test' });
      (mockApi.restartAgent as ReturnType<typeof vi.fn>).mockResolvedValue(updatedAgent);

      const { agents, restartAgent } = useAgents();
      agents.value.set('agent-1', mockAgentInfo({ id: 'agent-1', model: 'gpt-4o' }));

      await restartAgent('agent-1', 'claude-3-opus');

      expect(agents.value.get('agent-1')?.model).toBe('claude-3-opus');
      expect(agents.value.get('agent-1')?.status).toBe('running');
    });

    it('should set status to error on failed restart', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      (mockApi.restartAgent as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

      const { agents, restartAgent } = useAgents();
      agents.value.set('agent-1', mockAgentInfo({ id: 'agent-1', model: 'gpt-4o' }));

      await expect(restartAgent('agent-1', 'claude-3-opus')).rejects.toThrow('Network error');
      expect(agents.value.get('agent-1')?.status).toBe('error');

      consoleSpy.mockRestore();
    });
  });

  // ============ Phase 3: handleTokenUpdate ============

  describe('handleTokenUpdate', () => {
    it('should not throw when called', () => {
      const { handleTokenUpdate } = useAgents();
      expect(() => handleTokenUpdate()).not.toThrow();
    });
  });

  // ============ Phase 3: handleBudgetWarning ============

  describe('handleBudgetWarning', () => {
    it('should not throw when called', () => {
      const { handleBudgetWarning } = useAgents();
      expect(() => handleBudgetWarning()).not.toThrow();
    });
  });

  // ============ Phase 3: handle429 ============

  describe('handle429', () => {
    it('should log warning and not throw', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const { handle429 } = useAgents();
      expect(() => handle429('Budget exceeded')).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith('[useAgents] Budget exceeded: Budget exceeded');
      consoleSpy.mockRestore();
    });
  });
});
