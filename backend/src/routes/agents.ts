import { Router, Request, Response } from 'express';
import type { AgentManager } from '../services/AgentManager.js';
import type { ApiResponse, CreateAgentRequest, CreateAgentResponse, StdinRequest, AgentInfo, RestartAgentRequest } from '../types/index.js';

export function createAgentRoutes(agentManager: AgentManager): Router {
  const router = Router();

  // GET /api/agents — 获取所有 Agent 状态
  router.get('/agents', (_req: Request, res: Response) => {
    try {
      const agents: AgentInfo[] = agentManager.getAllAgents();
      const response: ApiResponse<AgentInfo[]> = {
        code: 0,
        data: agents,
        message: 'ok',
      };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal error';
      const response: ApiResponse<null> = {
        code: -1,
        data: null,
        message,
      };
      res.status(500).json(response);
    }
  });

  // Phase 2: GET /api/agents/:id/children — 获取某 agent 的所有后代
  router.get('/agents/:id/children', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const children = agentManager.getChildren(id);
      const response: ApiResponse<AgentInfo[]> = {
        code: 0,
        data: children,
        message: 'ok',
      };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal error';
      const response: ApiResponse<null> = {
        code: -1,
        data: null,
        message,
      };
      res.status(404).json(response);
    }
  });

  // POST /api/agents — 创建并启动 Agent
  // Phase 2: 请求体扩展 parentId | Phase 3: 扩展 model + 预算预检 429
  router.post('/agents', (req: Request, res: Response) => {
    try {
      const { cwd, workspaceId, parentId, model }: CreateAgentRequest = req.body;

      if (!cwd) {
        const response: ApiResponse<null> = {
          code: -1,
          data: null,
          message: 'cwd is required',
        };
        res.status(400).json(response);
        return;
      }

      // Phase 3: 预算预检（由 index.ts 注入的 budgetController 完成）
      // checkBudget 在 spawn 内部自动调用

      const agent = agentManager.spawn(cwd, workspaceId, parentId, undefined, model);
      const response: ApiResponse<CreateAgentResponse> = {
        code: 0,
        data: { agent },
        message: 'Agent created',
      };
      res.status(201).json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal error';

      // Phase 3: 预算超限返回 429
      if (message.includes('Budget exceeded') || message.includes('预算')) {
        res.status(429).json({
          code: 429,
          data: null,
          message,
        } as ApiResponse<null>);
        return;
      }

      const response: ApiResponse<null> = {
        code: -1,
        data: null,
        message,
      };
      res.status(400).json(response);
    }
  });

  // DELETE /api/agents/:id — 停止并移除 Agent
  // Phase 2: 查询参数 ?cascade=true/false
  router.delete('/agents/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const cascadeParam = req.query.cascade as string | undefined;
      const cascade = cascadeParam !== 'false'; // 默认 true

      agentManager.kill(id, cascade);
      const response: ApiResponse<null> = {
        code: 0,
        data: null,
        message: cascade ? 'Agent and descendants terminated' : 'Agent terminated (children orphaned)',
      };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal error';
      const response: ApiResponse<null> = {
        code: -1,
        data: null,
        message,
      };
      res.status(404).json(response);
    }
  });

  // POST /api/agents/:id/stdin — 向 Agent 发送输入
  router.post('/agents/:id/stdin', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { input }: StdinRequest = req.body;

      if (input === undefined || input === null) {
        const response: ApiResponse<null> = {
          code: -1,
          data: null,
          message: 'input is required',
        };
        res.status(400).json(response);
        return;
      }

      agentManager.sendStdin(id, input);
      const response: ApiResponse<null> = {
        code: 0,
        data: null,
        message: 'Input sent',
      };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal error';
      const response: ApiResponse<null> = {
        code: -1,
        data: null,
        message,
      };
      res.status(400).json(response);
    }
  });

  // Phase 3: PUT /api/agents/:id/restart — 运行时切换模型重启 agent
  router.put('/agents/:id/restart', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { model }: RestartAgentRequest = req.body;

      if (!model) {
        const response: ApiResponse<null> = {
          code: -1,
          data: null,
          message: 'model is required',
        };
        res.status(400).json(response);
        return;
      }

      const agent = agentManager.restart(id, model);
      const response: ApiResponse<CreateAgentResponse> = {
        code: 0,
        data: { agent },
        message: 'Agent restarted with new model',
      };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal error';
      const response: ApiResponse<null> = {
        code: -1,
        data: null,
        message,
      };
      res.status(404).json(response);
    }
  });

  return router;
}
