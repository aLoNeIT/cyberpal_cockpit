import { spawn, ChildProcess } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { CONFIG } from '../config.js';
import type { AgentConversationEvent, AgentInfo, AgentProcessInfo, AgentStatus } from '../types/index.js';
import type { TokenTracker } from './TokenTracker.js';
import type { BudgetController } from './BudgetController.js';
import type { ProviderConfigService } from './ProviderConfigService.js';
import { prepareOmpRuntimeConfig } from '../utils/ompRuntimeConfig.js';

interface JsonlLine {
  type: string;
  command?: string;
  success?: boolean;
  data?: {
    sessionFile?: string;
    sessionId?: string;
    contextUsage?: {
      tokens?: number | null;
      contextWindow?: number;
      percent?: number | null;
    };
  };
  name?: string;
  arguments?: Record<string, unknown>;
  toolName?: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
  result?: unknown;
  partialResult?: unknown;
  isError?: boolean;
  token_usage?: { input?: number; output?: number };
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  assistantMessageEvent?: {
    type?: string;
    delta?: string;
    thinking?: string;
    partial?: RpcAssistantMessage;
    message?: RpcAssistantMessage;
  };
  message?: RpcAssistantMessage;
  messages?: RpcAssistantMessage[];
  [key: string]: unknown;
}

interface RpcUsage {
  input?: number;
  output?: number;
  prompt_tokens?: number;
  completion_tokens?: number;
  cacheRead?: number;
  cacheWrite?: number;
  cache_read?: number;
  cache_write?: number;
  cost?: {
    input?: number;
    output?: number;
    cacheRead?: number;
    cacheWrite?: number;
    cache_read?: number;
    cache_write?: number;
    total?: number;
  };
}

interface RpcAssistantMessage {
  responseId?: string;
  usage?: RpcUsage;
}

export class AgentManager {
  private agents: Map<string, AgentProcessInfo> = new Map();
  private maxAgents: number;
  private recordedUsageKeys: Set<string> = new Set();
  private stdoutLineCarry: Map<string, string> = new Map();
  private busyAgents: Set<string> = new Set();

  // Phase 3: 注入外部依赖
  private tokenTracker: TokenTracker | null = null;
  private budgetController: BudgetController | null = null;
  private providerConfigService: Pick<ProviderConfigService, 'getModelRuntimeConfig'> | null = null;

  public onOutput: ((agentId: string, stream: 'stdout' | 'stderr', data: string) => void) | null = null;
  public onProcessEvent: ((event: AgentConversationEvent) => void) | null = null;
  public onSessionMetadata: ((agentId: string, sessionFile?: string, sessionId?: string) => void) | null = null;
  public onStatusChange: ((agentId: string, status: string, pid?: number) => void) | null = null;
  public onExit: ((agentId: string, code: number | null, signal: string | null) => void) | null = null;
  public onTaskSpawn: ((parentId: string, childId: string, taskDescription: string, cwd: string) => void) | null = null;
  public onTaskResult: ((childId: string, result: string, tokenCost: number) => void) | null = null;
  public onIrcDm: ((from: string, to: string, message: string) => void) | null = null;
  public onIrcBroadcast: ((from: string, message: string) => void) | null = null;
  public onConflictDetected: ((agentId: string, filePath: string, operation: string) => void) | null = null;

  constructor(maxAgents: number = CONFIG.maxAgents) {
    this.maxAgents = maxAgents;
  }

  /** Phase 3: 注入 TokenTracker 和 BudgetController */
  injectDependencies(
    tokenTracker: TokenTracker,
    budgetController: BudgetController,
    providerConfigService?: Pick<ProviderConfigService, 'getModelRuntimeConfig'>,
  ): void {
    this.tokenTracker = tokenTracker;
    this.budgetController = budgetController;
    this.providerConfigService = providerConfigService ?? null;
  }

  /**
   * Phase 3: spawn() — 增加 model 参数 + 预算预检
   */
  spawn(cwd: string, workspaceId?: string, parentId?: string, taskDescription?: string, model?: string): AgentInfo {
    // Phase 3: 预算预检
    if (this.budgetController && !parentId) {
      const check = this.budgetController.checkBudget();
      if (check.verdict === 'rejected') {
        throw new Error(
          `Budget exceeded: ${check.status.currentUsage} / ${check.status.monthlyLimit} tokens used`
        );
      }
      if (check.verdict === 'warning') {
        // 不阻止，但推送预警（由 index.ts 层处理）
        if (this.budgetController.onBudgetWarning) {
          this.budgetController.onBudgetWarning(check.status);
        }
      }
    }

    if (this.agents.size >= this.maxAgents) {
      throw new Error(`Maximum agent count (${this.maxAgents}) reached`);
    }

    const id = uuidv4();
    return this.spawnWithOptions({ id, cwd, workspaceId, parentId, taskDescription, model });
  }

  resume(agent: AgentInfo, input?: string): AgentInfo {
    if (!agent.sessionFile) {
      throw new Error(`Agent ${agent.id} has no session file to resume`);
    }
    if (this.agents.has(agent.id)) {
      if (input !== undefined) {
        this.sendStdin(agent.id, input);
      }
      return this.getAgent(agent.id)!;
    }
    const resumed = this.spawnWithOptions({
      id: agent.id,
      cwd: agent.cwd,
      workspaceId: agent.workspaceId ?? undefined,
      parentId: agent.parentId ?? undefined,
      taskDescription: agent.taskDescription,
      model: agent.model,
      createdAt: agent.createdAt,
      childIds: agent.childIds,
      isOrphaned: agent.isOrphaned,
      sessionFile: agent.sessionFile,
      sessionId: agent.sessionId,
    });
    if (input !== undefined) {
      this.sendStdin(agent.id, input);
    }
    return resumed;
  }

  private spawnWithOptions(options: {
    id: string;
    cwd: string;
    workspaceId?: string;
    parentId?: string;
    taskDescription?: string;
    model?: string;
    createdAt?: number;
    childIds?: string[];
    isOrphaned?: boolean;
    sessionFile?: string;
    sessionId?: string;
  }): AgentInfo {
    const { id, cwd, workspaceId, parentId, taskDescription, model, sessionFile, sessionId } = options;
    if (!this.agents.has(id) && this.agents.size >= this.maxAgents) {
      throw new Error(`Maximum agent count (${this.maxAgents}) reached`);
    }

    const args = [...CONFIG.ohMyPiArgsPrefix, '--mode', 'rpc'];
    if (sessionFile) {
      args.push('--resume', sessionFile);
    }
    const spawnEnv: NodeJS.ProcessEnv = { ...process.env };
    if (model) {
      const runtimeConfig = this.providerConfigService?.getModelRuntimeConfig(model);
      if (runtimeConfig) {
        const prepared = prepareOmpRuntimeConfig(CONFIG.ohMyPiAgentDir, runtimeConfig);
        spawnEnv.PI_CODING_AGENT_DIR = prepared.agentDir;
        args.push('--model', prepared.modelSelector);
      } else {
        args.push('--model', model);
      }
    }

    const childProcess: ChildProcess = spawn(CONFIG.ohMyPiPath, args, model ? { cwd, env: spawnEnv } : { cwd });

    const agentInfo: AgentProcessInfo = {
      id,
      cwd,
      status: 'running',
      pid: childProcess.pid ?? null,
      workspaceId: workspaceId ?? null,
      process: childProcess,
      createdAt: options.createdAt ?? Date.now(),
      stdoutBuffer: [],
      stderrBuffer: [],
      parentId: parentId ?? null,
      childIds: options.childIds ? [...options.childIds] : [],
      taskDescription,
      isOrphaned: options.isOrphaned ?? false,
      fileOperations: [],
      model: model,
      sessionFile,
      sessionId,
    };

    this.agents.set(id, agentInfo);

    if (parentId) {
      const parent = this.agents.get(parentId);
      if (parent) {
        parent.childIds.push(id);
      }
    }

    childProcess.stdout?.on('data', (chunk: Buffer) => {
      const data = chunk.toString();
      agentInfo.stdoutBuffer.push(data);
      if (agentInfo.stdoutBuffer.length > 1000) {
        agentInfo.stdoutBuffer.shift();
      }
      this.handleStdoutData(id, data);
    });

    childProcess.stderr?.on('data', (chunk: Buffer) => {
      const data = chunk.toString();
      agentInfo.stderrBuffer.push(data);
      if (agentInfo.stderrBuffer.length > 1000) {
        agentInfo.stderrBuffer.shift();
      }
      this.onOutput?.(id, 'stderr', data);
      this.emitProcessEvent(id, 'stderr', 'stderr', data, 'completed');
    });

    childProcess.on('error', (err: Error) => {
      agentInfo.status = 'error';
      agentInfo.stderrBuffer.push(err.message);
      this.onStatusChange?.(id, 'error', agentInfo.pid ?? undefined);
    });

    childProcess.on('exit', (code: number | null, signal: string | null) => {
      agentInfo.status = 'stopped';
      agentInfo.process = null;

      if (agentInfo.parentId) {
        const exitResult = code === 0 ? 'Task completed successfully' : `Task failed with code ${code}`;
        this.onTaskResult?.(id, exitResult, 0);
      }

      // Phase 3: 通知 TokenTracker flush
      this.tokenTracker?.flushAgent(id);

      this.onExit?.(id, code, signal);

      setTimeout(() => {
        this.cleanupAgent(id);
      }, 5000);
    });

    this.onStatusChange?.(id, 'running', agentInfo.pid ?? undefined);

    return {
      id,
      cwd,
      status: 'running',
      pid: agentInfo.pid,
      workspaceId: workspaceId ?? null,
      createdAt: agentInfo.createdAt,
      parentId: agentInfo.parentId,
      childIds: agentInfo.childIds,
      taskDescription: agentInfo.taskDescription,
      isOrphaned: agentInfo.isOrphaned,
      model: agentInfo.model,
      sessionFile: agentInfo.sessionFile,
      sessionId: agentInfo.sessionId,
    };
  }

  /**
   * Phase 3: restart(id, newModel) — 运行时模型切换
   */
  restart(id: string, newModel: string): AgentInfo {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error(`Agent ${id} not found`);
    }

    const cwd = agent.cwd;
    const wsId = agent.workspaceId;
    const pId = agent.parentId;
    const taskDesc = agent.taskDescription;

    // kill 旧进程（不级联）
    this.kill(id, false);

    // 推送 restarting 状态
    this.onStatusChange?.(id, 'restarting');

    // spawn 新进程
    return this.spawn(cwd, wsId ?? undefined, pId ?? undefined, taskDesc, newModel);
  }

  kill(id: string, cascade: boolean = true): void {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new Error(`Agent ${id} not found`);
    }

    if (cascade) {
      const descendants = this.collectDescendants(id);
      const depthMap = new Map<string, number>();
      this.computeDepth(id, 0, depthMap);
      descendants.sort((a, b) => (depthMap.get(b) ?? 0) - (depthMap.get(a) ?? 0));
      for (const descId of descendants) {
        this.killSingle(descId);
        this.tokenTracker?.flushAgent(descId);
        this.clearRecordedUsage(descId);
      }
    } else {
      for (const childId of agent.childIds) {
        this.markOrphaned(childId);
      }
    }

    this.killSingle(id);
    this.tokenTracker?.flushAgent(id);
    this.clearRecordedUsage(id);

    if (agent.parentId) {
      const parent = this.agents.get(agent.parentId);
      if (parent) {
        parent.childIds = parent.childIds.filter((cid) => cid !== id);
      }
    }
  }

  sendStdin(id: string, input: string): void {
    const agent = this.agents.get(id);
    if (!agent) throw new Error(`Agent ${id} not found`);
    if (!agent.process || !agent.process.stdin) throw new Error(`Agent ${id} stdin is not available`);
    const commandType = this.busyAgents.has(id) ? 'follow_up' : 'prompt';
    this.emitProcessEvent(id, 'user', 'User', input, 'completed');
    this.busyAgents.add(id);
    agent.process.stdin.write(`${JSON.stringify({ type: commandType, message: input })}\n`);
  }

  getAgent(id: string): AgentInfo | undefined {
    const agent = this.agents.get(id);
    return agent ? this.toAgentInfo(agent) : undefined;
  }

  getAllAgents(): AgentInfo[] {
    return Array.from(this.agents.values()).map((a) => this.toAgentInfo(a));
  }

  getAgentCount(): number {
    return this.agents.size;
  }

  getChildren(id: string): AgentInfo[] {
    return this.collectDescendants(id)
      .map((did) => { const a = this.agents.get(did); return a ? this.toAgentInfo(a) : null; })
      .filter((a): a is AgentInfo => a !== null);
  }

  // ───── 私有 ─────

  private toAgentInfo(agent: AgentProcessInfo): AgentInfo {
    return {
      id: agent.id,
      cwd: agent.cwd,
      status: agent.status,
      pid: agent.pid,
      workspaceId: agent.workspaceId,
      createdAt: agent.createdAt,
      parentId: agent.parentId,
      childIds: agent.childIds,
      taskDescription: agent.taskDescription,
      isOrphaned: agent.isOrphaned,
      model: agent.model,
      sessionFile: agent.sessionFile,
      sessionId: agent.sessionId,
    };
  }

  private killSingle(id: string): void {
    const agent = this.agents.get(id);
    if (!agent) return;
    if (agent.process && agent.process.exitCode === null) {
      agent.process.kill('SIGTERM');
      setTimeout(() => {
        if (agent.process && agent.process.exitCode === null) {
          try { agent.process.kill('SIGKILL'); } catch { /* ignore */ }
        }
      }, 3000);
    }
    agent.status = 'stopped';
    this.agents.delete(id);
  }

  private collectDescendants(rootId: string): string[] {
    const result: string[] = [];
    const queue: string[] = [rootId];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const current = this.agents.get(currentId);
      if (current && current.childIds.length > 0) {
        for (const childId of current.childIds) {
          if (childId !== rootId) { result.push(childId); queue.push(childId); }
        }
      }
    }
    return result;
  }

  private computeDepth(id: string, depth: number, map: Map<string, number>): void {
    map.set(id, depth);
    const agent = this.agents.get(id);
    if (agent) {
      for (const childId of agent.childIds) {
        this.computeDepth(childId, depth + 1, map);
      }
    }
  }

  private markOrphaned(id: string): void {
    const agent = this.agents.get(id);
    if (!agent) return;
    agent.isOrphaned = true;
    agent.parentId = null;
    for (const childId of agent.childIds) {
      this.markOrphaned(childId);
    }
    this.onStatusChange?.(id, agent.status, agent.pid ?? undefined);
  }

  private cleanupAgent(id: string): void {
    const agent = this.agents.get(id);
    if (agent && agent.status === 'stopped') {
      this.onConflictDetected?.(id, '', 'cleanup');
      this.agents.delete(id);
      this.clearRecordedUsage(id);
    }
  }

  private handleStdoutData(agentId: string, data: string): void {
    const combined = `${this.stdoutLineCarry.get(agentId) ?? ''}${data}`;
    const parts = combined.split('\n');
    const hasTrailingNewline = combined.endsWith('\n');
    const rawLines = hasTrailingNewline ? parts.slice(0, -1) : parts.slice(0, -1);
    this.stdoutLineCarry.set(agentId, hasTrailingNewline ? '' : parts[parts.length - 1]);

    const lines = rawLines.filter((line) => line.trim().length > 0);
    const plainLines: string[] = [];
    for (const line of lines) {
      try {
        const parsed: JsonlLine = JSON.parse(line);
        // Phase 3: 提取 token_usage（在任何 JSONL 事件类型下都检查）
        this.extractTokenUsage(agentId, parsed);
        this.captureSessionMetadata(agentId, parsed);
        this.requestSessionStateOnReady(agentId, parsed);
        this.handleRpcProcessEvent(agentId, parsed);
        this.handleJsonlLine(agentId, parsed);

        const displayText = this.extractRpcDisplayText(parsed);
        if (displayText !== null) {
          this.onOutput?.(agentId, 'stdout', displayText);
        } else if (!this.isKnownRpcEvent(parsed)) {
          plainLines.push(line);
        }
      } catch {
        plainLines.push(line);
      }
    }

    if (plainLines.length > 0) {
      this.onOutput?.(agentId, 'stdout', `${plainLines.join('\n')}${hasTrailingNewline ? '\n' : ''}`);
    }
  }

  private captureSessionMetadata(agentId: string, parsed: JsonlLine): void {
    if (parsed.type !== 'response' || parsed.command !== 'get_state' || parsed.success !== true || !parsed.data) {
      return;
    }
    const agent = this.agents.get(agentId);
    if (!agent) return;
    if (typeof parsed.data.sessionFile === 'string') {
      agent.sessionFile = parsed.data.sessionFile;
    }
    if (typeof parsed.data.sessionId === 'string') {
      agent.sessionId = parsed.data.sessionId;
    }
    this.onSessionMetadata?.(agentId, agent.sessionFile, agent.sessionId);
  }

  private requestSessionStateOnReady(agentId: string, parsed: JsonlLine): void {
    if (parsed.type !== 'ready') return;
    const agent = this.agents.get(agentId);
    if (!agent?.process?.stdin) return;
    agent.process.stdin.write(`${JSON.stringify({ type: 'get_state' })}\n`);
  }

  /**
   * Phase 3: 从 JSONL 行提取 token_usage / usage
   */
  private extractTokenUsage(agentId: string, parsed: JsonlLine): void {
    if (!this.tokenTracker) return;

    let inputTokens = 0;
    let outputTokens = 0;

    // 优先读取 token_usage（oh-my-pi 格式）
    if (parsed.token_usage) {
      inputTokens = parsed.token_usage.input ?? 0;
      outputTokens = parsed.token_usage.output ?? 0;
    }
    // fallback: usage 格式（常见 API 格式）
    if (inputTokens === 0 && outputTokens === 0 && parsed.usage) {
      inputTokens = parsed.usage.prompt_tokens ?? 0;
      outputTokens = parsed.usage.completion_tokens ?? 0;
    }
    const rpcUsage = this.extractRpcUsage(parsed);
    if (inputTokens === 0 && outputTokens === 0 && rpcUsage) {
      inputTokens = rpcUsage.inputTokens;
      outputTokens = rpcUsage.outputTokens;
      const usageKey = rpcUsage.responseId
        ? `${agentId}:${rpcUsage.responseId}`
        : `${agentId}:${parsed.type}:${inputTokens}:${outputTokens}`;
      if (this.recordedUsageKeys.has(usageKey)) {
        return;
      }
      this.recordedUsageKeys.add(usageKey);
    }

    const hasUsageDetails = Boolean(
      rpcUsage && (
        rpcUsage.details.cacheReadTokens > 0 ||
        rpcUsage.details.cacheWriteTokens > 0 ||
        rpcUsage.details.costUsd > 0
      )
    );

    if (inputTokens > 0 || outputTokens > 0 || hasUsageDetails) {
      const agent = this.agents.get(agentId);
      const details = hasUsageDetails ? rpcUsage?.details : undefined;
      if (agent?.workspaceId) {
        if (details) {
          this.tokenTracker.recordUsage(agentId, inputTokens, outputTokens, agent.model, agent.workspaceId, details);
        } else {
          this.tokenTracker.recordUsage(agentId, inputTokens, outputTokens, agent.model, agent.workspaceId);
        }
      } else {
        if (details) {
          this.tokenTracker.recordUsage(agentId, inputTokens, outputTokens, agent?.model, undefined, details);
        } else {
          this.tokenTracker.recordUsage(agentId, inputTokens, outputTokens, agent?.model);
        }
      }
    }
  }

  private extractRpcUsage(parsed: JsonlLine): {
    inputTokens: number;
    outputTokens: number;
    responseId?: string;
    details: { cacheReadTokens: number; cacheWriteTokens: number; costUsd: number };
  } | null {
    const messages = [
      parsed.message,
      parsed.assistantMessageEvent?.message,
      parsed.assistantMessageEvent?.partial,
      ...(parsed.messages ?? []),
    ].filter((message): message is RpcAssistantMessage => Boolean(message?.usage));

    for (const message of messages) {
      const usage = message.usage;
      if (!usage) continue;
      const inputTokens = usage.input ?? usage.prompt_tokens ?? 0;
      const outputTokens = usage.output ?? usage.completion_tokens ?? 0;
      const cacheReadTokens = usage.cacheRead ?? usage.cache_read ?? 0;
      const cacheWriteTokens = usage.cacheWrite ?? usage.cache_write ?? 0;
      const costUsd = usage.cost?.total ?? 0;
      if (inputTokens > 0 || outputTokens > 0 || cacheReadTokens > 0 || cacheWriteTokens > 0 || costUsd > 0) {
        return {
          inputTokens,
          outputTokens,
          responseId: message.responseId,
          details: { cacheReadTokens, cacheWriteTokens, costUsd },
        };
      }
    }

    return null;
  }

  private extractRpcDisplayText(parsed: JsonlLine): string | null {
    if (
      parsed.type === 'message_update' &&
      parsed.assistantMessageEvent?.type === 'text_delta' &&
      typeof parsed.assistantMessageEvent.delta === 'string'
    ) {
      return parsed.assistantMessageEvent.delta;
    }

    return null;
  }

  private handleRpcProcessEvent(agentId: string, parsed: JsonlLine): void {
    switch (parsed.type) {
      case 'agent_start':
      case 'turn_start':
        this.busyAgents.add(agentId);
        this.emitProcessEvent(agentId, 'working', 'Working', 'Agent is processing the request.', 'running');
        return;

      case 'agent_end':
      case 'turn_end':
        this.busyAgents.delete(agentId);
        this.emitProcessEvent(agentId, 'summary', 'Summary', this.extractTurnSummary(parsed), 'completed');
        return;

      case 'message_update': {
        const assistantEvent = parsed.assistantMessageEvent;
        if (!assistantEvent) return;
        if (assistantEvent.type === 'thinking_delta') {
          const content = assistantEvent.delta ?? assistantEvent.thinking ?? '';
          if (content) {
            this.emitProcessEvent(agentId, 'thinking', 'Thinking', content, 'running');
          }
          return;
        }
        if (assistantEvent.type === 'text_delta' && typeof assistantEvent.delta === 'string') {
          this.emitProcessEvent(agentId, 'assistant', 'Assistant', assistantEvent.delta, 'running');
        }
        return;
      }

      case 'tool_execution_start':
        this.emitProcessEvent(
          agentId,
          'tool',
          parsed.toolName ?? 'Tool',
          this.stringifyToolPayload(parsed.args),
          'running',
          { toolCallId: parsed.toolCallId, args: parsed.args },
        );
        return;

      case 'tool_execution_update':
        this.emitProcessEvent(
          agentId,
          'tool',
          parsed.toolName ?? 'Tool update',
          this.stringifyToolPayload(parsed.partialResult),
          'running',
          { toolCallId: parsed.toolCallId, args: parsed.args, partialResult: parsed.partialResult },
        );
        return;

      case 'tool_execution_end':
        this.emitProcessEvent(
          agentId,
          'tool',
          parsed.toolName ?? 'Tool',
          this.stringifyToolPayload(parsed.result),
          parsed.isError ? 'error' : 'completed',
          { toolCallId: parsed.toolCallId, result: parsed.result },
        );
        return;
    }
  }

  private extractTurnSummary(parsed: JsonlLine): string {
    const message = parsed.message;
    if (message && typeof (message as { content?: unknown }).content === 'string') {
      return (message as { content: string }).content;
    }
    return 'Turn completed.';
  }

  private stringifyToolPayload(payload: unknown): string {
    if (payload === undefined || payload === null) return '';
    if (typeof payload === 'string') return payload;
    if (typeof payload === 'object' && 'command' in payload && typeof (payload as { command?: unknown }).command === 'string') {
      return (payload as { command: string }).command;
    }
    try {
      return JSON.stringify(payload);
    } catch {
      return String(payload);
    }
  }

  private emitProcessEvent(
    agentId: string,
    kind: AgentConversationEvent['kind'],
    title: string,
    content: string,
    status: AgentConversationEvent['status'] = 'completed',
    metadata?: Record<string, unknown>,
  ): void {
    this.onProcessEvent?.({
      id: uuidv4(),
      agentId,
      kind,
      title,
      content,
      status,
      metadata,
      createdAt: Date.now(),
    });
  }

  private isKnownRpcEvent(parsed: JsonlLine): boolean {
    return [
      'ready',
      'response',
      'agent_start',
      'tool_use',
      'tool_execution_start',
      'tool_execution_update',
      'tool_execution_end',
      'tool_result',
      'turn_start',
      'message_start',
      'message_update',
      'message_end',
      'turn_end',
      'agent_end',
      'extension_ui_request',
      'session',
      'model_change',
      'thinking_level_change',
      'message',
    ].includes(parsed.type);
  }

  private clearRecordedUsage(agentId: string): void {
    this.stdoutLineCarry.delete(agentId);
    this.busyAgents.delete(agentId);
    for (const key of this.recordedUsageKeys) {
      if (key.startsWith(`${agentId}:`)) {
        this.recordedUsageKeys.delete(key);
      }
    }
  }

  private handleJsonlLine(agentId: string, parsed: JsonlLine): void {
    if (parsed.type !== 'tool_use' || !parsed.name || !parsed.arguments) return;

    const args = parsed.arguments as Record<string, unknown>;

    if (parsed.name === 'task') {
      const taskDesc = (args.description as string) || 'Unknown task';
      const worktree = (args.worktree as string) || '';
      if (worktree) {
        try {
          const child = this.spawn(worktree, undefined, agentId, taskDesc);
          this.onTaskSpawn?.(agentId, child.id, taskDesc, worktree);
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : 'Unknown error';
          this.onTaskResult?.(agentId, errorMsg, 0);
        }
      }
      return;
    }

    if (parsed.name === 'irc') {
      const ircType = (args.irc_type as string) || 'dm';
      const to = (args.to as string) || '';
      const message = (args.message as string) || '';
      if (ircType === 'broadcast') {
        this.onIrcBroadcast?.(agentId, message);
      } else {
        this.onIrcDm?.(agentId, to, message);
      }
      return;
    }

    const fileOpTools = ['write_to_file', 'replace_in_file', 'delete_file', 'edit_file', 'create_file'];
    if (fileOpTools.includes(parsed.name)) {
      const filePath = (args.file_path || args.path || args.filePath || args.target_file || '') as string;
      if (filePath) {
        let operation: 'create' | 'modify' | 'delete' = 'modify';
        if (parsed.name === 'delete_file') operation = 'delete';
        else if (parsed.name === 'write_to_file' || parsed.name === 'create_file') operation = 'create';
        this.onConflictDetected?.(agentId, filePath, operation);
      }
    }
  }
}
