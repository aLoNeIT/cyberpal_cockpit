import { Router, Request, Response } from 'express';
import type { AgentManager } from '../services/AgentManager.js';
import type { AgentEventRepository } from '../db/repositories/AgentEventRepository.js';
import type { AgentRecord, AgentRepository } from '../db/repositories/AgentRepository.js';
import type { ApiResponse, CreateAgentRequest, CreateAgentResponse, StdinRequest, AgentInfo, RestartAgentRequest, AgentEventsResponse, SendStdinResponse } from '../types/index.js';

export function createAgentRoutes(
  agentManager: AgentManager,
  agentEventRepo?: AgentEventRepository,
  agentRepo?: Pick<AgentRepository, 'findRecentAgentInfo' | 'findById'>,
): Router {
  const router = Router();

  // GET /api/agents — 获取所有 Agent 状态
  router.get('/agents', async (_req: Request, res: Response) => {
    try {
      const liveAgents: AgentInfo[] = agentManager.getAllAgents();
      const historicalAgents = agentRepo ? await agentRepo.findRecentAgentInfo(100) : [];
      const liveIds = new Set(liveAgents.map((agent) => agent.id));
      const agents = [
        ...liveAgents,
        ...historicalAgents.filter((agent) => !liveIds.has(agent.id)),
      ];
      const response: ApiResponse<AgentInfo[]> = {
        code: 0,
        data: agents,
        message: 'ok',
      };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '内部错误';
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
      const message = err instanceof Error ? err.message : '内部错误';
      const response: ApiResponse<null> = {
        code: -1,
        data: null,
        message,
      };
      res.status(404).json(response);
    }
  });

  // GET /api/agents/:id/events — 获取持久化会话过程事件
  router.get('/agents/:id/events', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const rawLimit = Number(req.query.limit ?? 500);
      const limit = Number.isFinite(rawLimit) ? Math.max(1, Math.min(rawLimit, 2000)) : 500;
      const events = agentEventRepo ? await agentEventRepo.findByAgent(id, limit) : [];
      const response: ApiResponse<AgentEventsResponse> = {
        code: 0,
        data: { events },
        message: 'ok',
      };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '内部错误';
      const response: ApiResponse<null> = {
        code: -1,
        data: null,
        message,
      };
      res.status(500).json(response);
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
          message: 'cwd 参数为必填项',
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
        message: 'Agent 创建成功',
      };
      res.status(201).json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '内部错误';

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
        message: cascade ? 'Agent 及其所有后代已终止' : 'Agent 已终止（子 Agent 已变为游离态）',
      };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '内部错误';
      const response: ApiResponse<null> = {
        code: -1,
        data: null,
        message,
      };
      res.status(404).json(response);
    }
  });

  // POST /api/agents/:id/stdin — 向 Agent 发送输入
  router.post('/agents/:id/stdin', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { input }: StdinRequest = req.body;

      if (input === undefined || input === null) {
        const response: ApiResponse<null> = {
          code: -1,
          data: null,
          message: 'input 参数为必填项',
        };
        res.status(400).json(response);
        return;
      }

      let resumedAgent: AgentInfo | undefined;
      if (agentManager.getAgent(id)) {
        agentManager.sendStdin(id, input);
      } else {
        const persisted = agentRepo ? await agentRepo.findById(id) : undefined;
        if (!persisted) {
          throw new Error(`Agent ${id} not found`);
        }
        resumedAgent = agentManager.resume(agentRecordToInfo(persisted), input);
      }
      const response: ApiResponse<SendStdinResponse | null> = {
        code: 0,
        data: resumedAgent ? { agent: resumedAgent } : null,
        message: resumedAgent ? '会话已恢复，输入已发送' : '输入已发送',
      };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '内部错误';
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
          message: 'model 参数为必填项',
        };
        res.status(400).json(response);
        return;
      }

      const agent = agentManager.restart(id, model);
      const response: ApiResponse<CreateAgentResponse> = {
        code: 0,
        data: { agent },
        message: 'Agent 已使用新模型重启',
      };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '内部错误';
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

function agentRecordToInfo(row: AgentRecord): AgentInfo {
  return {
    id: row.id,
    cwd: row.cwd,
    status: row.status === 'running' ? 'stopped' : row.status as AgentInfo['status'],
    pid: null,
    workspaceId: row.workspace_id,
    createdAt: row.created_at,
    parentId: row.parent_id,
    childIds: [],
    taskDescription: row.task_description ?? undefined,
    isOrphaned: false,
    model: row.model ?? undefined,
    sessionFile: row.session_file ?? undefined,
    sessionId: row.session_id ?? undefined,
  };
}
