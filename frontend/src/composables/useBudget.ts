import { ref, computed, onMounted } from 'vue';
import type { Ref, ComputedRef } from 'vue';
import * as api from '@/services/api';
import type {
  BudgetConfig,
  BudgetStatus,
  TokenUpdateEvent,
  DailyTokenRecord,
  ModelInfo,
} from '@/types';
import { getModelSelector } from '@/utils/modelSelector';

export function useBudget() {
  const budgetConfig: Ref<BudgetConfig> = ref({
    monthlyLimit: 0,
    warningThreshold: 0.8,
    overrunPolicy: 'reject_new',
    excludedAgentIds: [],
    cycleType: 'monthly',
  });

  const budgetStatus: Ref<BudgetStatus> = ref({
    currentUsage: 0,
    monthlyLimit: 0,
    remaining: Infinity,
    percentage: 0,
    isWarning: false,
    isExceeded: false,
    lastResetDate: '',
    excludedUsage: 0,
  });

  const tokenRecords: Ref<Map<string, TokenUpdateEvent>> = ref(new Map());
  const models: Ref<ModelInfo[]> = ref([]);

  const usagePercentage: ComputedRef<number> = computed(() => budgetStatus.value.percentage);
  const remainingBudget: ComputedRef<number> = computed(() => budgetStatus.value.remaining);
  const isBudgetWarning: ComputedRef<boolean> = computed(() => budgetStatus.value.isWarning);
  const isBudgetExceeded: ComputedRef<boolean> = computed(() => budgetStatus.value.isExceeded);

  /**
   * 按 agent 聚合 Token 用量（降序）
   */
  function getByAgent(): Map<string, number> {
    const map = new Map<string, number>();
    for (const [id, record] of tokenRecords.value) {
      map.set(id, record.cumulativeTokens);
    }
    // 降序排列
    return new Map([...map.entries()].sort((a, b) => b[1] - a[1]));
  }

  /**
   * 按 workspace 聚合 Token 用量
   */
  function getByWorkspace(agentWorkspaceMap: Map<string, string>): Map<string, number> {
    const map = new Map<string, number>();
    for (const [agentId, record] of tokenRecords.value) {
      const ws = record.workspaceId || agentWorkspaceMap.get(agentId) || 'unknown';
      map.set(ws, (map.get(ws) || 0) + record.cumulativeTokens);
    }
    return new Map([...map.entries()].sort((a, b) => b[1] - a[1]));
  }

  /**
   * 按日期查询（调用 API）
   */
  async function getByDate(days: number): Promise<DailyTokenRecord[]> {
    const end = new Date();
    const start = new Date();
    start.setDate(start.getDate() - days);
    const startStr = start.toISOString().split('T')[0];
    const endStr = end.toISOString().split('T')[0];
    return api.fetchTokenRecords({ startDate: startStr, endDate: endStr });
  }

  /**
   * WS 回调：Token 更新
   */
  function onTokenUpdate(event: TokenUpdateEvent): void {
    tokenRecords.value.set(event.agentId, event);

    // 同时更新 budgetStatus（累计简单估算）
    let total = 0;
    for (const rec of tokenRecords.value.values()) {
      total += rec.cumulativeTokens;
    }
    budgetStatus.value.currentUsage = total;
    if (budgetStatus.value.monthlyLimit > 0) {
      budgetStatus.value.percentage = total / budgetStatus.value.monthlyLimit;
      budgetStatus.value.remaining = Math.max(0, budgetStatus.value.monthlyLimit - total);
      budgetStatus.value.isWarning = budgetStatus.value.percentage >= (budgetConfig.value.warningThreshold);
      budgetStatus.value.isExceeded = budgetStatus.value.percentage >= 1.0;
    }
  }

  /**
   * WS 回调：预算预警
   */
  function onBudgetWarning(status: BudgetStatus): void {
    budgetStatus.value = { ...status };
  }

  /**
   * 初始化：加载预算数据
   */
  async function init(): Promise<void> {
    try {
      const [config, status, modelList] = await Promise.all([
        api.fetchBudget(),
        api.fetchBudgetStatus(),
        api.fetchModels(),
      ]);
      budgetConfig.value = config;
      budgetStatus.value = status;
      models.value = modelList.map((model) => ({
        ...model,
        id: getModelSelector(model),
      }));
    } catch (err) {
      console.error('[useBudget] Init failed:', err);
    }
  }

  return {
    budgetConfig,
    budgetStatus,
    tokenRecords,
    models,
    usagePercentage,
    remainingBudget,
    isBudgetWarning,
    isBudgetExceeded,
    getByAgent,
    getByWorkspace,
    getByDate,
    onTokenUpdate,
    onBudgetWarning,
    init,
  };
}
