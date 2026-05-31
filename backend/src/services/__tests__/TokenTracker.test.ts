import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Must use literal strings in vi.mock (hoisted)
vi.mock('../../config.js', () => ({
  CONFIG: {
    port: 3001,
    corsOrigin: 'http://localhost:5173',
    ohMyPiPath: 'oh-my-pi',
    ohMyPiArgsPrefix: [],
    maxAgents: 4,
    agentSpawnTimeout: 10000,
    wsHeartbeatInterval: 30000,
    wsHeartbeatTimeout: 60000,
    conflictWindowMs: 60000,
    cascadeKillDefault: true,
    ircMaxMessages: 1000,
    autoAssignSlotEnabled: true,
    monthlyLimit: 0,
    warningThreshold: 0.8,
    overrunPolicy: 'reject_new',
    tokenFlushIntervalMs: 5000,
    budgetCheckIntervalMs: 3600000,
    localStoragePrefix: 'cpc_',
    dbDriver: 'sqlite',
    dbSqlitePath: ':memory:',
    dbMysqlHost: '',
    dbMysqlPort: 3306,
    dbMysqlUser: 'root',
    dbMysqlPassword: '',
    dbMysqlDatabase: 'test',
  },
}));

import { TokenTracker } from '../TokenTracker.js';
import type { TokenRepository } from '../../db/repositories/TokenRepository.js';
import type { DailyTokenRecord } from '../../types/index.js';

/**
 * Create a mock TokenRepository with an in-memory store.
 */
function createMockTokenRepo() {
  const records: DailyTokenRecord[] = [];

  const repo = {
    insert: vi.fn(async (record: any) => {
      records.push({
        date: record.date,
        agentId: record.agentId,
        workspaceId: record.workspaceId,
        model: record.model,
        inputTokens: record.inputTokens,
        outputTokens: record.outputTokens,
        cacheReadTokens: record.cacheReadTokens ?? 0,
        cacheWriteTokens: record.cacheWriteTokens ?? 0,
        cumulativeTokens: record.cumulativeTokens,
        costUsd: record.costUsd ?? 0,
      });
    }),
    upsertDaily: vi.fn(async (record: any) => {
      const idx = records.findIndex(
        (r) => r.date === record.date && r.agentId === record.agentId
      );
      if (idx >= 0) {
        records[idx].inputTokens += record.inputTokens;
        records[idx].outputTokens += record.outputTokens;
        records[idx].cacheReadTokens += record.cacheReadTokens ?? 0;
        records[idx].cacheWriteTokens += record.cacheWriteTokens ?? 0;
        records[idx].cumulativeTokens += record.cumulativeTokens;
        records[idx].costUsd += record.costUsd ?? 0;
      } else {
        records.push({
          date: record.date,
          agentId: record.agentId,
          workspaceId: record.workspaceId,
          model: record.model,
          inputTokens: record.inputTokens,
          outputTokens: record.outputTokens,
          cacheReadTokens: record.cacheReadTokens ?? 0,
          cacheWriteTokens: record.cacheWriteTokens ?? 0,
          cumulativeTokens: record.cumulativeTokens,
          costUsd: record.costUsd ?? 0,
        });
      }
    }),
    query: vi.fn(async (params: any) => {
      return records.filter((r) => {
        if (params.startDate && r.date < params.startDate) return false;
        if (params.endDate && r.date > params.endDate) return false;
        if (params.agentId && r.agentId !== params.agentId) return false;
        if (params.workspaceId && r.workspaceId !== params.workspaceId) return false;
        return true;
      });
    }),
    getByMonth: vi.fn(async (month: string) => {
      return records.filter((r) => r.date.startsWith(month));
    }),
    deleteByMonth: vi.fn(async (_month: string) => {
      // Clear records for the deleted month
      const filtered = records.filter((r) => !r.date.startsWith(_month));
      records.length = 0;
      records.push(...filtered);
      return records.length;
    }),
    getAgentTotal: vi.fn(async (_agentId: string) => 0),
    getTotalUsage: vi.fn(async () => records.reduce((sum, r) => sum + r.cumulativeTokens, 0)),
    bulkInsert: vi.fn(async (recs: any[]) => {
      for (const rec of recs) {
        records.push({ ...rec });
      }
    }),
  };

  return { repo: repo as unknown as TokenRepository, records };
}

describe('TokenTracker', () => {
  let tracker: TokenTracker;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-06-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function newTracker(): { tracker: TokenTracker; records: DailyTokenRecord[] } {
    const { repo, records } = createMockTokenRepo();
    const t = new TokenTracker(repo);
    return { tracker: t, records };
  }

  // ============ recordUsage ============

  describe('recordUsage', () => {
    it('should record token usage for an agent', () => {
      const { tracker: t } = newTracker();
      t.recordUsage('agent-1', 100, 50);
      expect(t.getAgentTokens('agent-1')).toBe(150);
    });

    it('should accumulate multiple calls for same agent', () => {
      const { tracker: t } = newTracker();
      t.recordUsage('agent-1', 100, 50);
      t.recordUsage('agent-1', 200, 100);
      expect(t.getAgentTokens('agent-1')).toBe(450);
    });

    it('should track different agents separately', () => {
      const { tracker: t } = newTracker();
      t.recordUsage('agent-1', 100, 50);
      t.recordUsage('agent-2', 300, 200);
      expect(t.getAgentTokens('agent-1')).toBe(150);
      expect(t.getAgentTokens('agent-2')).toBe(500);
    });

    it('should return 0 for unknown agent', () => {
      const { tracker: t } = newTracker();
      expect(t.getAgentTokens('unknown')).toBe(0);
    });

    it('should skip zero-zero records', () => {
      const { tracker: t } = newTracker();
      t.recordUsage('agent-1', 0, 0);
      expect(t.getAgentTokens('agent-1')).toBe(0);
    });

    it('should fire onTokenUpdate callback', () => {
      const { tracker: t } = newTracker();
      const onUpdate = vi.fn();
      t.onTokenUpdate = onUpdate;
      t.recordUsage('agent-1', 10, 5);
      expect(onUpdate).toHaveBeenCalledWith({
        agentId: 'agent-1',
        inputTokens: 10,
        outputTokens: 5,
        cumulativeTokens: 15,
        model: undefined,
      });
    });

    it('should track model parameter', () => {
      const { tracker: t } = newTracker();
      const onUpdate = vi.fn();
      t.onTokenUpdate = onUpdate;
      t.recordUsage('agent-1', 10, 5, 'gpt-4o');
      expect(onUpdate).toHaveBeenCalledWith({
        agentId: 'agent-1',
        inputTokens: 10,
        outputTokens: 5,
        cumulativeTokens: 15,
        model: 'gpt-4o',
      });
    });

    it('should persist workspaceId with token records', async () => {
      const { tracker: t, records } = newTracker();
      t.recordUsage('agent-1', 10, 5, 'gpt-4o', 'ws-001');
      t.flushAgent('agent-1');
      await vi.advanceTimersByTimeAsync(100);

      expect(records[0].workspaceId).toBe('ws-001');
    });

    it('should include cache and cost usage in totals, events, and persisted records', async () => {
      const { tracker: t, records } = newTracker();
      const onUpdate = vi.fn();
      t.onTokenUpdate = onUpdate;

      t.recordUsage('agent-1', 100, 50, 'gpt-4o', 'ws-001', {
        cacheReadTokens: 1000,
        cacheWriteTokens: 25,
        costUsd: 0.012345,
      });
      t.flushAgent('agent-1');
      await vi.advanceTimersByTimeAsync(100);

      expect(t.getAgentTokens('agent-1')).toBe(175);
      expect(onUpdate).toHaveBeenCalledWith({
        agentId: 'agent-1',
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 1000,
        cacheWriteTokens: 25,
        cumulativeTokens: 175,
        costUsd: 0.012345,
        model: 'gpt-4o',
        workspaceId: 'ws-001',
      });
      expect(records[0]).toMatchObject({
        inputTokens: 100,
        outputTokens: 50,
        cacheReadTokens: 1000,
        cacheWriteTokens: 25,
        cumulativeTokens: 175,
        costUsd: 0.012345,
      });
    });
  });

  // ============ flush / persistence ============

  describe('flush and persistence', () => {
    it('should flush pending records to repository', async () => {
      const { tracker: t, records } = newTracker();
      t.recordUsage('agent-1', 100, 50);
      t.recordUsage('agent-2', 200, 100);

      // Flush via flushAgent
      t.flushAgent('agent-1');
      // Allow async flush to complete
      await vi.advanceTimersByTimeAsync(100);

      expect(records.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ============ getTotalUsage ============

  describe('getTotalUsage', () => {
    it('should sum all agent tokens', () => {
      const { tracker: t } = newTracker();
      t.recordUsage('agent-1', 100, 50);
      t.recordUsage('agent-2', 200, 100);
      expect(t.getTotalUsage()).toBe(450);
    });

    it('should return 0 with no records', () => {
      const { tracker: t } = newTracker();
      expect(t.getTotalUsage()).toBe(0);
    });
  });

  // ============ getDailyRecords ============

  describe('getDailyRecords', () => {
    it('should return flushed records', async () => {
      const { tracker: t, records } = newTracker();
      t.recordUsage('agent-1', 100, 50, 'gpt-4o');
      t.flushAgent('agent-1');
      await vi.advanceTimersByTimeAsync(100);

      const result = await t.getDailyRecords();
      expect(result.length).toBeGreaterThanOrEqual(1);
      const agent1Records = result.filter((r) => r.agentId === 'agent-1');
      expect(agent1Records.length).toBeGreaterThanOrEqual(1);
      expect(agent1Records[0].model).toBe('gpt-4o');
    });

    it('should filter by agentId', async () => {
      const { tracker: t, records } = newTracker();
      t.recordUsage('agent-a', 10, 5);
      t.recordUsage('agent-b', 20, 10);
      t.flushAgent('agent-a');
      t.flushAgent('agent-b');
      await vi.advanceTimersByTimeAsync(100);

      const result = await t.getDailyRecords(undefined, undefined, 'agent-a');
      expect(result.every((r) => r.agentId === 'agent-a')).toBe(true);
    });

    it('should filter by date range', async () => {
      const { tracker: t } = newTracker();
      t.recordUsage('agent-1', 10, 5);
      t.flushAgent('agent-1');
      await vi.advanceTimersByTimeAsync(100);

      const result = await t.getDailyRecords('2025-06-16', '2025-06-20');
      expect(result).toEqual([]);
    });
  });

  // ============ monthly archive ============

  describe('archive and reset', () => {
    it('should archive a month', async () => {
      const { tracker: t } = newTracker();
      t.recordUsage('agent-1', 100, 50);
      t.flushAgent('agent-1');
      await vi.advanceTimersByTimeAsync(100);

      await t.archiveMonth('2025-06');

      // Records for 2025-06 should be deleted
      const result = await t.getDailyRecords();
      expect(result.length).toBe(0);
    });

    it('should reset current month', async () => {
      const { tracker: t } = newTracker();
      t.recordUsage('agent-1', 100, 50);
      t.flushAgent('agent-1');
      await vi.advanceTimersByTimeAsync(100);

      await t.resetCurrentMonth();

      expect(t.getTotalUsage()).toBe(0);
      const result = await t.getDailyRecords();
      expect(result).toEqual([]);
    });
  });
});
