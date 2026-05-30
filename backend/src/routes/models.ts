import { Router, Request, Response } from 'express';
import type { ApiResponse, ModelInfo } from '../types/index.js';
import type { ProviderConfigService } from '../services/ProviderConfigService.js';

export function createModelRoutes(providerConfigService?: ProviderConfigService): Router {
  const router = Router();

  // GET /api/models — 获取可用模型列表（合并 provider 配置中的模型）
  router.get('/models', (_req: Request, res: Response) => {
    try {
      let models: ModelInfo[];

      if (providerConfigService) {
        models = providerConfigService.getMergedModels();
        // 如果合并后为空，回退到硬编码列表
        if (models.length === 0) {
          models = getDefaultModels();
        }
      } else {
        models = getDefaultModels();
      }

      const response: ApiResponse<ModelInfo[]> = { code: 0, data: models, message: 'ok' };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal error';
      res.status(500).json({ code: -1, data: null, message });
    }
  });

  return router;
}

/** 默认硬编码模型列表（兜底） */
function getDefaultModels(): ModelInfo[] {
  return [
    { id: 'deepseek-chat', name: 'DeepSeek V3', provider: 'DeepSeek', isDefault: true },
    { id: 'deepseek-reasoner', name: 'DeepSeek R1', provider: 'DeepSeek', isDefault: false },
    { id: 'qwen-plus', name: 'Qwen Plus', provider: 'Alibaba', isDefault: false },
    { id: 'qwen-max', name: 'Qwen Max', provider: 'Alibaba', isDefault: false },
    { id: 'gpt-4o', name: 'GPT-4o', provider: 'OpenAI', isDefault: false },
    { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'OpenAI', isDefault: false },
    { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'Anthropic', isDefault: false },
    { id: 'claude-3-opus', name: 'Claude 3 Opus', provider: 'Anthropic', isDefault: false },
  ];
}
