import { ref, computed } from 'vue';
import type { Ref, ComputedRef } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import * as api from '@/services/api';
import type { AgentConversationEvent, AgentInfo, AgentStatus, ConflictEvent } from '@/types';

export interface ConflictNotification {
  id: string;
  event: ConflictEvent;
  dismissed: boolean;
}

function getErrorMessage(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const response = (err as { response?: { data?: { message?: unknown } } }).response;
    if (typeof response?.data?.message === 'string') {
      return response.data.message;
    }
    if (err instanceof Error) {
      return err.message;
    }
  }
  return 'Agent 启动失败';
}

function getSendErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) {
    return err.message;
  }
  if (typeof err === 'object' && err !== null) {
    const response = (err as { response?: { data?: { message?: unknown } } }).response;
    if (typeof response?.data?.message === 'string') {
      return response.data.message;
    }
  }
  return '发送失败';
}

export function useAgents() {
  const agents: Ref<Map<string, AgentInfo>> = ref(new Map());
  const terminalOutputs: Ref<Map<string, string>> = ref(new Map());
  const markdownOutputs: Ref<Map<string, string>> = ref(new Map());
  const conversationEvents: Ref<Map<string, AgentConversationEvent[]>> = ref(new Map());
  const launchError: Ref<string | null> = ref(null);

  // Phase 2: 冲突通知列表
  const conflicts: Ref<ConflictNotification[]> = ref([]);

  const agentList: ComputedRef<AgentInfo[]> = computed(() => {
    return Array.from(agents.value.values());
  });

  async function createAgent(cwd: string, workspaceId?: string, model?: string): Promise<AgentInfo> {
    launchError.value = null;
    try {
      const result = await api.createAgent({ cwd, workspaceId, model });
      // 确保 Phase 2 字段有默认值
      const agentWithDefaults: AgentInfo = {
        ...result.agent,
        parentId: result.agent.parentId ?? null,
        childIds: result.agent.childIds ?? [],
        isOrphaned: result.agent.isOrphaned ?? false,
      };
      agents.value.set(agentWithDefaults.id, agentWithDefaults);
      terminalOutputs.value.set(agentWithDefaults.id, '');
      markdownOutputs.value.set(agentWithDefaults.id, '');
      conversationEvents.value.set(agentWithDefaults.id, []);
      return agentWithDefaults;
    } catch (err) {
      launchError.value = getErrorMessage(err);
      throw err;
    }
  }

  async function loadAgents(): Promise<AgentInfo[]> {
    const loaded = await api.fetchAgents();
    agents.value.clear();
    terminalOutputs.value.clear();
    markdownOutputs.value.clear();
    conversationEvents.value.clear();

    for (const agent of loaded) {
      const agentWithDefaults: AgentInfo = {
        ...agent,
        parentId: agent.parentId ?? null,
        childIds: agent.childIds ?? [],
        isOrphaned: agent.isOrphaned ?? false,
      };
      agents.value.set(agentWithDefaults.id, agentWithDefaults);
      terminalOutputs.value.set(agentWithDefaults.id, '');
      markdownOutputs.value.set(agentWithDefaults.id, '');
      conversationEvents.value.set(agentWithDefaults.id, []);
    }

    await Promise.all(loaded.map((agent) => loadAgentEvents(agent.id)));
    return loaded;
  }

  async function loadAgentEvents(agentId: string): Promise<void> {
    const events = await api.fetchAgentEvents(agentId);
    conversationEvents.value.set(agentId, events);
    rebuildOutputsFromEvents(agentId, events);
  }

  function clearLaunchError(): void {
    launchError.value = null;
  }

  async function killAgent(id: string, cascade: boolean = true): Promise<void> {
    await api.deleteAgent(id, cascade);
    agents.value.delete(id);
    terminalOutputs.value.delete(id);
    markdownOutputs.value.delete(id);
    conversationEvents.value.delete(id);
    // 也从冲突列表中移除相关记录
    conflicts.value = conflicts.value.filter((c) => c.event.agentA !== id && c.event.agentB !== id);
  }

  function appendUserInput(id: string, input: string): void {
    const terminalCurrent = terminalOutputs.value.get(id) || '';
    terminalOutputs.value.set(id, `${terminalCurrent}\r\n> ${input}\r\n`);

    const markdownCurrent = markdownOutputs.value.get(id) || '';
    markdownOutputs.value.set(id, `${markdownCurrent}\n> ${input}\n\n`);
  }

  function appendSendError(id: string, message: string): void {
    const terminalCurrent = terminalOutputs.value.get(id) || '';
    terminalOutputs.value.set(id, `${terminalCurrent}\r\n[发送失败] ${message}\r\n`);

    const markdownCurrent = markdownOutputs.value.get(id) || '';
    markdownOutputs.value.set(id, `${markdownCurrent}\n\n**发送失败：${message}**\n`);
  }

  function sendStdin(id: string, input: string): void {
    appendUserInput(id, input);
    api.sendStdin(id, input).then((result) => {
      if (result?.agent) {
        agents.value.set(id, {
          ...result.agent,
          parentId: result.agent.parentId ?? null,
          childIds: result.agent.childIds ?? [],
          isOrphaned: result.agent.isOrphaned ?? false,
        });
      }
    }).catch((err) => {
      console.error(`[useAgents] Failed to send stdin to agent ${id}:`, err);
      appendSendError(id, getSendErrorMessage(err));
    });
  }

  function getAgent(id: string): ComputedRef<AgentInfo | undefined> {
    return computed(() => agents.value.get(id));
  }

  function appendOutput(id: string, data: string): void {
    const current = terminalOutputs.value.get(id) || '';
    terminalOutputs.value.set(id, current + data);

    const mdCurrent = markdownOutputs.value.get(id) || '';
    markdownOutputs.value.set(id, mdCurrent + data);
  }

  function appendConversationEvent(event: AgentConversationEvent, updateTextOutputs: boolean = true): void {
    const current = conversationEvents.value.get(event.agentId) || [];
    if (!current.some((item) => item.id === event.id)) {
      conversationEvents.value.set(event.agentId, [...current, event]);
    }

    if (!updateTextOutputs) return;
    if (event.kind === 'assistant' && event.content) {
      appendOutput(event.agentId, event.content);
    } else if (event.kind === 'stderr' && event.content) {
      appendOutput(event.agentId, `\n${event.content}`);
    }
  }

  function rebuildOutputsFromEvents(agentId: string, events: AgentConversationEvent[]): void {
    const terminal = events.map(formatEventForTerminal).filter(Boolean).join('');
    const markdown = events.map(formatEventForMarkdown).filter(Boolean).join('');
    terminalOutputs.value.set(agentId, terminal);
    markdownOutputs.value.set(agentId, markdown);
  }

  function formatEventForTerminal(event: AgentConversationEvent): string {
    switch (event.kind) {
      case 'user':
        return `\r\n> ${event.content}\r\n`;
      case 'assistant':
        return event.content;
      case 'thinking':
        return event.content ? `\r\n[thinking] ${event.content}\r\n` : '';
      case 'working':
        return `\r\n[working] ${event.content || event.title || 'Working'}\r\n`;
      case 'tool':
        return `\r\n[${event.status === 'completed' ? 'tool done' : 'tool'}] ${event.title || 'Tool'} ${event.content}\r\n`;
      case 'summary':
        return `\r\n[summary] ${event.content}\r\n`;
      case 'stderr':
      case 'system':
        return `\r\n[${event.title || event.kind}] ${event.content}\r\n`;
      default:
        return '';
    }
  }

  function formatEventForMarkdown(event: AgentConversationEvent): string {
    switch (event.kind) {
      case 'user':
        return `\n> ${event.content}\n\n`;
      case 'assistant':
        return event.content;
      case 'summary':
        return `\n\n**总结**：${event.content}\n`;
      default:
        return event.content ? `\n\n**${event.title || event.kind}**：${event.content}\n` : '';
    }
  }

  function updateStatus(id: string, status: AgentStatus): void {
    const agent = agents.value.get(id);
    if (agent) {
      agent.status = status;
    }
  }

  function clearOutput(id: string): void {
    terminalOutputs.value.set(id, '');
    markdownOutputs.value.set(id, '');
    conversationEvents.value.set(id, []);
  }

  // ═══════════ Phase 2: 新增方法 ═══════════

  /**
   * 处理 task spawn 事件：创建子 AgentInfo 并加入 agents Map
   */
  function handleTaskSpawn(payload: { parentId: string; childId: string; taskDescription: string; cwd: string }): void {
    const childAgent: AgentInfo = {
      id: payload.childId,
      cwd: payload.cwd,
      status: 'running',
      pid: null,
      workspaceId: null,
      createdAt: Date.now(),
      parentId: payload.parentId,
      childIds: [],
      taskDescription: payload.taskDescription,
      isOrphaned: false,
    };

    agents.value.set(payload.childId, childAgent);
    terminalOutputs.value.set(payload.childId, '');
    markdownOutputs.value.set(payload.childId, '');
    conversationEvents.value.set(payload.childId, []);

    // 更新父 agent 的 childIds
    const parent = agents.value.get(payload.parentId);
    if (parent && !parent.childIds.includes(payload.childId)) {
      parent.childIds.push(payload.childId);
    }

    // 自动分配格子
    autoAssignSlot(payload.childId);
  }

  /**
   * 处理 task result 事件
   */
  function handleTaskResult(payload: { childId: string; result: string; tokenCost: number }): void {
    const agent = agents.value.get(payload.childId);
    if (agent) {
      // 在终端中追加结果信息
      const current = terminalOutputs.value.get(payload.childId) || '';
      const resultLine = `\n\x1b[36m[Task Result] ${payload.result} (tokens: ${payload.tokenCost})\x1b[0m\n`;
      terminalOutputs.value.set(payload.childId, current + resultLine);
    }
  }

  /**
   * 处理冲突事件：记录到冲突列表，向对应 agent 终端输出警告
   */
  function handleConflict(event: ConflictEvent): void {
    const notification: ConflictNotification = {
      id: uuidv4(),
      event,
      dismissed: false,
    };
    conflicts.value.unshift(notification);

    // 限制冲突通知数量（保留最近 20 条）
    if (conflicts.value.length > 20) {
      conflicts.value = conflicts.value.slice(0, 20);
    }

    // 向冲突双方的终端输出黄色 ANSI 警告
    const warnA = `\n\x1b[33m⚠ CONFLICT: ${event.filePath} — ${event.agentA.slice(0, 8)} (${event.operationA}) vs ${event.agentB.slice(0, 8)} (${event.operationB})\x1b[0m\n`;
    const warnB = `\n\x1b[33m⚠ CONFLICT: ${event.filePath} — your ${event.operationB} conflicts with ${event.agentA.slice(0, 8)}'s ${event.operationA}\x1b[0m\n`;

    appendOutput(event.agentA, warnA);
    appendOutput(event.agentB, warnB);
  }

  /**
   * Phase 3: 切换模型重启 agent
   */
  async function restartAgent(id: string, newModel: string): Promise<void> {
    const agent = agents.value.get(id);
    if (agent) {
      agent.status = 'restarting';
    }

    try {
      const updated = await api.restartAgent(id, newModel);
      agents.value.set(id, updated);
      updateStatus(id, 'running');
    } catch (err) {
      console.error(`[useAgents] Failed to restart agent ${id}:`, err);
      updateStatus(id, 'error');
      throw err;
    }
  }

  /**
   * Phase 3: 处理 Token 更新
   */
  function handleTokenUpdate(): void {
    // Token 更新由 useBudget composable 专门处理
    // 此方法留作未来扩展（如在 agent 终端中显示 Token 信息）
  }

  /**
   * Phase 3: 处理预算预警
   */
  function handleBudgetWarning(): void {
    // 预算预警由 useBudget composable 专门处理
    // 此方法留作未来扩展
  }

  /**
   * Phase 3: 处理 429 预算超限
   */
  function handle429(message: string): void {
    launchError.value = message;
    console.warn(`[useAgents] Budget exceeded: ${message}`);
  }

  /**
   * 处理 IRC 消息：目前由 useIrcLog 独立管理
   * （预留接口，实际消息由 useIrcLog 消费）
   */
  function handleIrc(_payload: { from: string; to?: string; message: string; type: 'dm' | 'broadcast' }): void {
    // IRC 消息由 useIrcLog composable 专门处理
    // 此方法留作未来扩展（如在 agent 终端中显示通知）
  }

  /**
   * 子 agent 自动格子分配
   * 当前总 agent 数 < 4 → 直接分配
   * 已达上限 → 找最旧非活跃子 agent 替换
   */
  function autoAssignSlot(childId: string): void {
    const currentCount = agents.value.size;

    if (currentCount <= 4) {
      // 格子充足，无需额外操作
      return;
    }

    // 已达上限，找最旧非活跃子 agent 替换
    const childAgents = Array.from(agents.value.values()).filter(
      (a) => a.parentId !== null && a.status !== 'running',
    );

    if (childAgents.length > 0) {
      // 按 createdAt 升序排列，取最旧的
      childAgents.sort((a, b) => a.createdAt - b.createdAt);
      const oldest = childAgents[0];

      // 从宫格视图移除（保留在 agents Map，可通过会话树重新打开）
      console.log(`[useAgents] Auto-replacing slot: removing agent ${oldest.id} to make room for ${childId}`);
      // 不清除数据，仅从视图层隐藏——视图层通过 agentList computed 过滤实现
    }
  }

  function dismissConflict(conflictId: string): void {
    const idx = conflicts.value.findIndex((c) => c.id === conflictId);
    if (idx !== -1) {
      conflicts.value[idx].dismissed = true;
    }
  }

  const activeConflicts = computed(() => conflicts.value.filter((c) => !c.dismissed));

  return {
    agents,
    agentList,
    terminalOutputs,
    markdownOutputs,
    conversationEvents,
    launchError,
    conflicts,
    activeConflicts,
    createAgent,
    loadAgents,
    loadAgentEvents,
    clearLaunchError,
    killAgent,
    sendStdin,
    getAgent,
    appendOutput,
    appendConversationEvent,
    updateStatus,
    clearOutput,
    // Phase 2 新增
    handleTaskSpawn,
    handleTaskResult,
    handleConflict,
    handleIrc,
    autoAssignSlot,
    dismissConflict,
    // Phase 3 新增
    restartAgent,
    handleTokenUpdate,
    handleBudgetWarning,
    handle429,
  };
}
