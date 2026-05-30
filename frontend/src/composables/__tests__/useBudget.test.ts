import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useBudget } from '../useBudget';
import type { TokenUpdateEvent, BudgetStatus } from '@/types';

// Mock API — all literal values in factory (hoisted)
vi.mock('@/services/api', () => ({
  fetchBudget: vi.fn().mockResolvedValue({
    monthlyLimit: 100000,
    warningThreshold: 0.8,
    overrunPolicy: 'reject_new',
    excludedAgentIds: [],
    cycleType: 'monthly',
  }),
  fetchBudgetStatus: vi.fn().mockResolvedValue({
    currentUsage: 30000,
    monthlyLimit: 100000,
    remaining: 70000,
    percentage: 0.3,
    isWarning: false,
    isExceeded: false,
    lastResetDate: '2025-06-01',
    excludedUsage: 0,
  }),
  fetchModels: vi.fn().mockResolvedValue([
    { id: 'deepseek-chat', name: 'DeepSeek V3', provider: 'DeepSeek', isDefault: true },
  ]),
  updateBudget: vi.fn(),
  fetchTokenRecords: vi.fn().mockResolvedValue([]),
}));

describe('useBudget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ============ getByAgent ============

  describe('getByAgent', () => {
    it('should aggregate tokens by agent in descending order', () => {
      const { onTokenUpdate, getByAgent } = useBudget();

      onTokenUpdate({ agentId: 'agent-a', inputTokens: 100, outputTokens: 50, cumulativeTokens: 1500, model: 'gpt-4o' });
      onTokenUpdate({ agentId: 'agent-b', inputTokens: 200, outputTokens: 100, cumulativeTokens: 3000, model: 'claude-3' });
      onTokenUpdate({ agentId: 'agent-c', inputTokens: 50, outputTokens: 25, cumulativeTokens: 750, model: 'qwen' });

      const byAgent = getByAgent();
      const entries = [...byAgent.entries()];

      // Descending order by cumulativeTokens
      expect(entries[0][0]).toBe('agent-b');
      expect(entries[0][1]).toBe(3000);
      expect(entries[1][0]).toBe('agent-a');
      expect(entries[1][1]).toBe(1500);
      expect(entries[2][0]).toBe('agent-c');
      expect(entries[2][1]).toBe(750);
    });

    it('should return empty map when no records', () => {
      const { getByAgent } = useBudget();
      expect(getByAgent().size).toBe(0);
    });

    it('should update values for same agent (latest wins)', () => {
      const { onTokenUpdate, getByAgent } = useBudget();

      onTokenUpdate({ agentId: 'agent-x', inputTokens: 10, outputTokens: 5, cumulativeTokens: 100, model: 'm1' });
      onTokenUpdate({ agentId: 'agent-x', inputTokens: 20, outputTokens: 10, cumulativeTokens: 250, model: 'm1' });

      const byAgent = getByAgent();
      expect(byAgent.get('agent-x')).toBe(250); // latest value
    });
  });

  // ============ getByWorkspace ============

  describe('getByWorkspace', () => {
    it('should aggregate tokens by workspace', () => {
      const { onTokenUpdate, getByWorkspace } = useBudget();
      const agentWsMap = new Map<string, string>([
        ['agent-a', 'ws-frontend'],
        ['agent-b', 'ws-frontend'],
        ['agent-c', 'ws-backend'],
      ]);

      onTokenUpdate({ agentId: 'agent-a', inputTokens: 100, outputTokens: 50, cumulativeTokens: 100, model: 'm1' });
      onTokenUpdate({ agentId: 'agent-b', inputTokens: 200, outputTokens: 100, cumulativeTokens: 200, model: 'm2' });
      onTokenUpdate({ agentId: 'agent-c', inputTokens: 300, outputTokens: 200, cumulativeTokens: 500, model: 'm3' });

      const byWs = getByWorkspace(agentWsMap);

      // ws-frontend: 100 + 200 = 300, ws-backend: 500
      expect(byWs.get('ws-frontend')).toBe(300);
      expect(byWs.get('ws-backend')).toBe(500);
    });

    it('should group unknown agents under "unknown"', () => {
      const { onTokenUpdate, getByWorkspace } = useBudget();

      onTokenUpdate({ agentId: 'mystery', inputTokens: 10, outputTokens: 5, cumulativeTokens: 50, model: 'm1' });

      const byWs = getByWorkspace(new Map());
      expect(byWs.get('unknown')).toBe(50);
    });
  });

  // ============ onTokenUpdate ============

  describe('onTokenUpdate', () => {
    it('should update budgetStatus percentage', () => {
      const { onTokenUpdate, budgetStatus } = useBudget();

      // Set limit directly on status (onTokenUpdate checks budgetStatus.monthlyLimit)
      budgetStatus.value = { ...budgetStatus.value, monthlyLimit: 100000 };

      onTokenUpdate({ agentId: 'agent-1', inputTokens: 50000, outputTokens: 30000, cumulativeTokens: 80000, model: 'gpt-4o' });

      expect(budgetStatus.value.currentUsage).toBe(80000);
      expect(budgetStatus.value.percentage).toBeCloseTo(0.8);
      expect(budgetStatus.value.isWarning).toBe(true); // 0.8 >= 0.8
      expect(budgetStatus.value.isExceeded).toBe(false);
    });

    it('should set isExceeded when over 100%', () => {
      const { onTokenUpdate, budgetStatus } = useBudget();

      budgetStatus.value = { ...budgetStatus.value, monthlyLimit: 100000 };

      onTokenUpdate({ agentId: 'agent-1', inputTokens: 90000, outputTokens: 20000, cumulativeTokens: 110000, model: 'gpt-4o' });

      expect(budgetStatus.value.isExceeded).toBe(true);
      expect(budgetStatus.value.percentage).toBeCloseTo(1.1);
    });

    it('should not divide by zero when limit is 0', () => {
      const { onTokenUpdate, budgetStatus } = useBudget();

      // monthlyLimit stays at 0 (default)
      expect(() => {
        onTokenUpdate({ agentId: 'a', inputTokens: 100, outputTokens: 50, cumulativeTokens: 150, model: 'm' });
      }).not.toThrow();
    });
  });

  // ============ onBudgetWarning ============

  describe('onBudgetWarning', () => {
    it('should update budgetStatus from WS warning', () => {
      const { onBudgetWarning, budgetStatus } = useBudget();

      const warningStatus: BudgetStatus = {
        currentUsage: 95000,
        monthlyLimit: 100000,
        remaining: 5000,
        percentage: 0.95,
        isWarning: true,
        isExceeded: false,
        lastResetDate: '2025-06-01',
        excludedUsage: 0,
      };

      onBudgetWarning(warningStatus);

      expect(budgetStatus.value.currentUsage).toBe(95000);
      expect(budgetStatus.value.isWarning).toBe(true);
    });
  });
});
