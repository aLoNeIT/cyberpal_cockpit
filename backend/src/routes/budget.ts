import { Router, Request, Response } from 'express';
import type { BudgetController } from '../services/BudgetController.js';
import type { TokenTracker } from '../services/TokenTracker.js';
import type { ApiResponse, BudgetConfig, BudgetStatus, DailyTokenRecord } from '../types/index.js';

export function createBudgetRoutes(budgetController: BudgetController, tokenTracker: TokenTracker): Router {
  const router = Router();

  // GET /api/budget — 获取当前预算配置
  router.get('/budget', (_req: Request, res: Response) => {
    try {
      const config: BudgetConfig = budgetController.getConfig();
      const response: ApiResponse<BudgetConfig> = { code: 0, data: config, message: 'ok' };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal error';
      res.status(500).json({ code: -1, data: null, message });
    }
  });

  // PUT /api/budget — 更新预算配置
  router.put('/budget', (req: Request, res: Response) => {
    try {
      const config: BudgetConfig = budgetController.updateConfig(req.body);
      const response: ApiResponse<BudgetConfig> = { code: 0, data: config, message: 'Budget updated' };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal error';
      res.status(400).json({ code: -1, data: null, message });
    }
  });

  // GET /api/budget/status — 获取当前预算状态
  router.get('/budget/status', (_req: Request, res: Response) => {
    try {
      const status: BudgetStatus = budgetController.getStatus();
      const response: ApiResponse<BudgetStatus> = { code: 0, data: status, message: 'ok' };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal error';
      res.status(500).json({ code: -1, data: null, message });
    }
  });

  // GET /api/budget/tokens — 查询 Token 消耗记录
  router.get('/budget/tokens', async (req: Request, res: Response) => {
    try {
      const { agentId, workspaceId, startDate, endDate } = req.query as {
        agentId?: string;
        workspaceId?: string;
        startDate?: string;
        endDate?: string;
      };
      const records: DailyTokenRecord[] = await tokenTracker.getDailyRecords(
        startDate,
        endDate,
        agentId,
        workspaceId
      );
      const response: ApiResponse<DailyTokenRecord[]> = { code: 0, data: records, message: 'ok' };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal error';
      res.status(500).json({ code: -1, data: null, message });
    }
  });

  return router;
}
