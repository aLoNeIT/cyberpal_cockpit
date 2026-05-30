import { CONFIG } from '../config.js';
import type { DailyTokenRecord, TokenUsage, TokenUpdateEvent } from '../types/index.js';
import type { TokenRepository } from '../db/repositories/TokenRepository.js';

export class TokenTracker {
  private agentTokens: Map<string, TokenUsage> = new Map();
  private pendingRecords: DailyTokenRecord[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private tokenRepo: TokenRepository;

  public onTokenUpdate: ((event: TokenUpdateEvent) => void) | null = null;

  constructor(tokenRepo: TokenRepository) {
    this.tokenRepo = tokenRepo;
    this.startFlushTimer();
    this.registerShutdownHook();
  }

  /** 异步初始化：从 DB 加载当月数据 */
  async init(): Promise<void> {
    try {
      const month = this.currentMonth();
      const records = await this.tokenRepo.getByMonth(month);

      for (const rec of records) {
        let usage = this.agentTokens.get(rec.agentId);
        if (!usage) {
          usage = {
            agentId: rec.agentId,
            inputTokens: 0,
            outputTokens: 0,
            cumulativeTokens: 0,
            lastUpdated: Date.now(),
          };
          this.agentTokens.set(rec.agentId, usage);
        }
        usage.inputTokens += rec.inputTokens;
        usage.outputTokens += rec.outputTokens;
        usage.cumulativeTokens += rec.cumulativeTokens;
      }
    } catch {
      // 数据库不可用时从零开始
    }
  }

  /**
   * 记录 Token 使用增量
   */
  recordUsage(agentId: string, inputTokens: number, outputTokens: number, model?: string): void {
    if (inputTokens === 0 && outputTokens === 0) return;

    let usage = this.agentTokens.get(agentId);
    if (!usage) {
      usage = {
        agentId,
        inputTokens: 0,
        outputTokens: 0,
        cumulativeTokens: 0,
        lastUpdated: Date.now(),
      };
      this.agentTokens.set(agentId, usage);
    }

    usage.inputTokens += inputTokens;
    usage.outputTokens += outputTokens;
    usage.cumulativeTokens += inputTokens + outputTokens;
    usage.lastUpdated = Date.now();

    // 记录到待刷新队列
    const today = this.todayStr();
    const existing = this.pendingRecords.find(
      (r) => r.date === today && r.agentId === agentId
    );
    if (existing) {
      existing.inputTokens += inputTokens;
      existing.outputTokens += outputTokens;
      existing.cumulativeTokens += inputTokens + outputTokens;
    } else {
      this.pendingRecords.push({
        date: today,
        agentId,
        workspaceId: null,
        model: model || 'unknown',
        inputTokens,
        outputTokens,
        cumulativeTokens: inputTokens + outputTokens,
      });
    }

    // 推送更新事件
    this.onTokenUpdate?.({
      agentId,
      inputTokens,
      outputTokens,
      cumulativeTokens: usage.cumulativeTokens,
      model,
    });
  }

  /**
   * agent 退出时 flush 该 agent 的数据
   */
  flushAgent(agentId: string): void {
    this.flush();
  }

  /**
   * 获取某 agent 的累计 Token
   */
  getAgentTokens(agentId: string): number {
    return this.agentTokens.get(agentId)?.cumulativeTokens ?? 0;
  }

  /**
   * 获取当月总消耗（供 BudgetController 调用）
   */
  getTotalUsage(): number {
    let total = 0;
    for (const usage of this.agentTokens.values()) {
      total += usage.cumulativeTokens;
    }
    return total;
  }

  /**
   * 按条件查询历史记录
   */
  async getDailyRecords(
    startDate?: string,
    endDate?: string,
    agentId?: string,
    workspaceId?: string
  ): Promise<DailyTokenRecord[]> {
    return this.tokenRepo.query({
      startDate,
      endDate,
      agentId,
      workspaceId,
    });
  }

  /**
   * 获取当月所有记录（供月度归档用）
   */
  async getCurrentMonthRecords(): Promise<DailyTokenRecord[]> {
    const month = this.currentMonth();
    return this.tokenRepo.getByMonth(month);
  }

  /**
   * 月度归档：备份上月数据，清零当月
   */
  async archiveMonth(prevMonth: string): Promise<void> {
    await this.tokenRepo.deleteByMonth(prevMonth);
  }

  /**
   * 重置当月计数（预算重置时调用）
   */
  async resetCurrentMonth(): Promise<void> {
    this.agentTokens.clear();
    this.pendingRecords = [];
    const month = this.currentMonth();
    await this.tokenRepo.deleteByMonth(month);
  }

  // ───── 私有方法 ─────

  private flush(): void {
    if (this.pendingRecords.length === 0) return;

    const recordsToFlush = [...this.pendingRecords];
    this.pendingRecords = [];

    // 异步写入数据库（fire-and-forget）
    for (const record of recordsToFlush) {
      this.tokenRepo.upsertDaily({
        date: record.date,
        agentId: record.agentId,
        workspaceId: record.workspaceId,
        model: record.model,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        cumulativeTokens: record.cumulativeTokens,
      }).catch(() => {
        // 持久化失败时放回队列
        this.pendingRecords.push(record);
      });
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, CONFIG.tokenFlushIntervalMs);
  }

  private registerShutdownHook(): void {
    const shutdown = () => {
      if (this.flushTimer) clearInterval(this.flushTimer);
      this.flush();
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  }

  private currentMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private todayStr(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
