import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createBudgetRoutes } from '../budget.js';
import type { BudgetController } from '../../services/BudgetController.js';
import type { TokenTracker } from '../../services/TokenTracker.js';

function createMockBudgetController(overrides: Record<string, unknown> = {}) {
  return {
    getConfig: vi.fn().mockReturnValue({
      monthlyLimit: 100000,
      warningThreshold: 0.8,
      overrunPolicy: 'reject_new',
      excludedAgentIds: [],
      cycleType: 'monthly',
    }),
    updateConfig: vi.fn().mockImplementation((partial) => ({
      monthlyLimit: 100000,
      warningThreshold: 0.8,
      overrunPolicy: 'reject_new',
      excludedAgentIds: [],
      cycleType: 'monthly',
      ...partial,
    })),
    getStatus: vi.fn().mockReturnValue({
      currentUsage: 30000,
      monthlyLimit: 100000,
      remaining: 70000,
      percentage: 0.3,
      isWarning: false,
      isExceeded: false,
      lastResetDate: '2025-06-01',
      excludedUsage: 0,
    }),
    checkBudget: vi.fn().mockReturnValue({ verdict: 'ok', status: {} }),
    ...overrides,
  };
}

function createMockTokenTracker(overrides: Record<string, unknown> = {}) {
  return {
    getDailyRecords: vi.fn().mockReturnValue([]),
    getTotalUsage: vi.fn().mockReturnValue(0),
    ...overrides,
  };
}

describe('Budget Routes', () => {
  let app: express.Express;
  let mockBudgetCtrl: ReturnType<typeof createMockBudgetController>;
  let mockTokenTracker: ReturnType<typeof createMockTokenTracker>;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    mockBudgetCtrl = createMockBudgetController();
    mockTokenTracker = createMockTokenTracker();
    const router = createBudgetRoutes(
      mockBudgetCtrl as unknown as BudgetController,
      mockTokenTracker as unknown as TokenTracker
    );
    app.use('/api', router);
  });

  // ============ GET /api/budget ============

  describe('GET /api/budget', () => {
    it('should return current budget config', async () => {
      const res = await request(app).get('/api/budget').expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.data.monthlyLimit).toBe(100000);
      expect(res.body.data.warningThreshold).toBe(0.8);
      expect(res.body.data.overrunPolicy).toBe('reject_new');
    });
  });

  // ============ PUT /api/budget ============

  describe('PUT /api/budget', () => {
    it('should update budget config', async () => {
      const res = await request(app)
        .put('/api/budget')
        .send({ monthlyLimit: 200000, warningThreshold: 0.5 })
        .expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.message).toBe('Budget updated');
      expect(mockBudgetCtrl.updateConfig).toHaveBeenCalledWith({
        monthlyLimit: 200000,
        warningThreshold: 0.5,
      });
    });

    it('should update with overrunPolicy', async () => {
      await request(app)
        .put('/api/budget')
        .send({ overrunPolicy: 'warn_only' })
        .expect(200);

      expect(mockBudgetCtrl.updateConfig).toHaveBeenCalledWith({
        overrunPolicy: 'warn_only',
      });
    });
  });

  // ============ GET /api/budget/status ============

  describe('GET /api/budget/status', () => {
    it('should return budget status', async () => {
      const res = await request(app).get('/api/budget/status').expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.data.currentUsage).toBe(30000);
      expect(res.body.data.remaining).toBe(70000);
      expect(res.body.data.percentage).toBe(0.3);
      expect(res.body.data.isWarning).toBe(false);
      expect(res.body.data.isExceeded).toBe(false);
    });

    it('should reflect warning state', async () => {
      mockBudgetCtrl.getStatus = vi.fn().mockReturnValue({
        currentUsage: 85000,
        monthlyLimit: 100000,
        remaining: 15000,
        percentage: 0.85,
        isWarning: true,
        isExceeded: false,
        lastResetDate: '2025-06-01',
        excludedUsage: 0,
      });

      const res = await request(app).get('/api/budget/status').expect(200);

      expect(res.body.data.isWarning).toBe(true);
      expect(res.body.data.percentage).toBe(0.85);
    });
  });

  // ============ GET /api/budget/tokens ============

  describe('GET /api/budget/tokens', () => {
    it('should return token records', async () => {
      mockTokenTracker.getDailyRecords = vi.fn().mockReturnValue([
        {
          date: '2025-06-15',
          agentId: 'agent-1',
          workspaceId: 'ws-1',
          model: 'gpt-4o',
          inputTokens: 1000,
          outputTokens: 500,
          cumulativeTokens: 1500,
        },
      ]);

      const res = await request(app).get('/api/budget/tokens').expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].agentId).toBe('agent-1');
      expect(res.body.data[0].model).toBe('gpt-4o');
    });

    it('should filter tokens by agentId query', async () => {
      const spy = mockTokenTracker.getDailyRecords as ReturnType<typeof vi.fn>;

      await request(app)
        .get('/api/budget/tokens?agentId=agent-x')
        .expect(200);

      expect(spy).toHaveBeenCalledWith(
        undefined,
        undefined,
        'agent-x',
        undefined
      );
    });

    it('should filter by date range', async () => {
      const spy = mockTokenTracker.getDailyRecords as ReturnType<typeof vi.fn>;

      await request(app)
        .get('/api/budget/tokens?startDate=2025-06-01&endDate=2025-06-15')
        .expect(200);

      expect(spy).toHaveBeenCalledWith(
        '2025-06-01',
        '2025-06-15',
        undefined,
        undefined
      );
    });
  });
});
