import { spawn, ChildProcess } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import { CONFIG } from '../config.js';
import type { AgentInfo, AgentProcessInfo, AgentStatus } from '../types/index.js';
import type { TokenTracker } from './TokenTracker.js';
import type { BudgetController } from './BudgetController.js';

interface JsonlLine {
  type: string;
  name?: string;
  arguments?: Record<string, unknown>;
  token_usage?: { input?: number; output?: number };
  usage?: { prompt_tokens?: number; completion_tokens?: number };
  [key: string]: unknown;
}

export class AgentManager {
  private agents: Map<string, AgentProcessInfo> = new Map();
  private maxAgents: number;

  // Phase 3: 注入外部依赖
  private tokenTracker: TokenTracker | null = null;
  private budgetController: BudgetController | null = null;

  public onOutput: ((agentId: string, stream: 'stdout' | 'stderr', data: string) => void) | null = null;
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
  injectDependencies(tokenTracker: TokenTracker, budgetController: BudgetController): void {
    this.tokenTracker = tokenTracker;
    this.budgetController = budgetController;
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
    const args = ['--mode', 'json'];
    if (model) {
      args.push('--model', model);
    }

    const process: ChildProcess = spawn(CONFIG.ohMyPiPath, args, { cwd });

    const agentInfo: AgentProcessInfo = {
      id,
      cwd,
      status: 'running',
      pid: process.pid ?? null,
      workspaceId: workspaceId ?? null,
      process,
      createdAt: Date.now(),
      stdoutBuffer: [],
      stderrBuffer: [],
      parentId: parentId ?? null,
      childIds: [],
      taskDescription,
      isOrphaned: false,
      fileOperations: [],
      model: model,
    };

    this.agents.set(id, agentInfo);

    if (parentId) {
      const parent = this.agents.get(parentId);
      if (parent) {
        parent.childIds.push(id);
      }
    }

    process.stdout?.on('data', (chunk: Buffer) => {
      const data = chunk.toString();
      agentInfo.stdoutBuffer.push(data);
      if (agentInfo.stdoutBuffer.length > 1000) {
        agentInfo.stdoutBuffer.shift();
      }
      this.onOutput?.(id, 'stdout', data);
      this.parseJSONLLines(id, data);
    });

    process.stderr?.on('data', (chunk: Buffer) => {
      const data = chunk.toString();
      agentInfo.stderrBuffer.push(data);
      if (agentInfo.stderrBuffer.length > 1000) {
        agentInfo.stderrBuffer.shift();
      }
      this.onOutput?.(id, 'stderr', data);
    });

    process.on('error', (err: Error) => {
      agentInfo.status = 'error';
      agentInfo.stderrBuffer.push(err.message);
      this.onStatusChange?.(id, 'error', agentInfo.pid ?? undefined);
    });

    process.on('exit', (code: number | null, signal: string | null) => {
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
      }
    } else {
      for (const childId of agent.childIds) {
        this.markOrphaned(childId);
      }
    }

    this.killSingle(id);
    this.tokenTracker?.flushAgent(id);

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
    agent.process.stdin.write(input + '\n');
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
    }
  }

  private parseJSONLLines(agentId: string, data: string): void {
    const lines = data.split('\n').filter((line) => line.trim().length > 0);
    for (const line of lines) {
      try {
        const parsed: JsonlLine = JSON.parse(line);
        // Phase 3: 提取 token_usage（在任何 JSONL 事件类型下都检查）
        this.extractTokenUsage(agentId, parsed);
        this.handleJsonlLine(agentId, parsed);
      } catch { /* 非 JSON 行静默丢弃 */ }
    }
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

    if (inputTokens > 0 || outputTokens > 0) {
      const agent = this.agents.get(agentId);
      this.tokenTracker.recordUsage(agentId, inputTokens, outputTokens, agent?.model);
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
