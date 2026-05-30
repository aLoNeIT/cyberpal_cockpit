import { CONFIG } from '../config.js';
import type { BudgetConfig, BudgetStatus, OverrunPolicy } from '../types/index.js';
import type { TokenTracker } from './TokenTracker.js';

export class BudgetController {
  private config: BudgetConfig;
  private tokenTracker: TokenTracker;
  private lastResetDate: string;
  private checkTimer: ReturnType<typeof setInterval> | null = null;

  public onBudgetWarning: ((status: BudgetStatus) => void) | null = null;

  constructor(tokenTracker: TokenTracker) {
    this.tokenTracker = tokenTracker;
    this.config = {
      monthlyLimit: CONFIG.monthlyLimit,
      warningThreshold: CONFIG.warningThreshold,
      overrunPolicy: CONFIG.overrunPolicy,
      excludedAgentIds: [],
      cycleType: 'monthly',
    };
    this.lastResetDate = this.todayStr();
    this.startMonthlyCheck();
  }

  /**
   * 预算预检：返回 'ok' | 'warning' | 'rejected'
   */
  checkBudget(): { verdict: 'ok' | 'warning' | 'rejected'; status: BudgetStatus } {
    const status = this.getStatus();

    if (this.config.monthlyLimit === 0) {
      return { verdict: 'ok', status };
    }

    // 超限
    if (status.percentage >= 1.0) {
      if (this.config.overrunPolicy === 'reject_new' || this.config.overrunPolicy === 'kill_oldest') {
        return { verdict: 'rejected', status };
      }
      // warn_only: 不拒绝
      return { verdict: 'warning', status };
    }

    // 预警
    if (status.percentage >= this.config.warningThreshold) {
      return { verdict: 'warning', status };
    }

    return { verdict: 'ok', status };
  }

  /**
   * 获取当前预算状态快照
   */
  getStatus(): BudgetStatus {
    const currentUsage = this.tokenTracker.getTotalUsage();
    const monthlyLimit = this.config.monthlyLimit;
    const remaining = monthlyLimit === 0 ? Infinity : Math.max(0, monthlyLimit - currentUsage);
    const percentage = monthlyLimit === 0 ? 0 : currentUsage / monthlyLimit;

    // excluded agents 的消耗统计（简化：仅使用内存数据）
    let excludedUsage = 0;

    return {
      currentUsage,
      monthlyLimit,
      remaining,
      percentage,
      isWarning: monthlyLimit > 0 && percentage >= this.config.warningThreshold,
      isExceeded: monthlyLimit > 0 && percentage >= 1.0,
      lastResetDate: this.lastResetDate,
      excludedUsage,
    };
  }

  /**
   * 更新预算配置
   */
  updateConfig(partial: Partial<BudgetConfig>): BudgetConfig {
    if (partial.monthlyLimit !== undefined) this.config.monthlyLimit = partial.monthlyLimit;
    if (partial.warningThreshold !== undefined) this.config.warningThreshold = partial.warningThreshold;
    if (partial.overrunPolicy !== undefined) this.config.overrunPolicy = partial.overrunPolicy;
    if (partial.excludedAgentIds !== undefined) this.config.excludedAgentIds = partial.excludedAgentIds;
    if (partial.cycleType !== undefined) this.config.cycleType = partial.cycleType;
    if (partial.cycleStartDay !== undefined) this.config.cycleStartDay = partial.cycleStartDay;

    const status = this.getStatus();
    if (status.isWarning || status.isExceeded) {
      this.onBudgetWarning?.(status);
    }

    return { ...this.config };
  }

  /**
   * 获取当前预算配置
   */
  getConfig(): BudgetConfig {
    return { ...this.config };
  }

  // ───── 私有 ─────

  /**
   * 每小时检查是否跨月，跨月自动清零
   */
  private startMonthlyCheck(): void {
    this.checkTimer = setInterval(() => {
      const nowMonth = this.currentMonth();
      const lastMonth = this.getMonth(this.lastResetDate);

      if (nowMonth !== lastMonth) {
        // 跨月：归档上月数据，清零（异步 fire-and-forget）
        this.tokenTracker.archiveMonth(lastMonth).catch(() => {});
        this.tokenTracker.resetCurrentMonth().catch(() => {});
        this.lastResetDate = this.todayStr();
        console.log(`[BudgetController] Monthly reset: ${lastMonth} → ${nowMonth}`);
      }
    }, CONFIG.budgetCheckIntervalMs);

    // cleanup on exit
    const cleanup = () => {
      if (this.checkTimer) clearInterval(this.checkTimer);
    };
    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
  }

  private todayStr(): string {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  private currentMonth(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private getMonth(dateStr: string): string {
    return dateStr.substring(0, 7);
  }
}
