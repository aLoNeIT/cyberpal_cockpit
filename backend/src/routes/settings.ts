import { Router, Request, Response } from 'express';
import type { ApiResponse, ProviderSummary, ProviderDetail, ProviderConfig, CreateProviderRequest, UpdateProviderRequest } from '../types/index.js';
import type { ProviderConfigService } from '../services/ProviderConfigService.js';

export function createSettingsRoutes(providerConfigService: ProviderConfigService): Router {
  const router = Router();

  // GET /api/settings/providers — 返回所有 provider 摘要
  router.get('/settings/providers', (_req: Request, res: Response) => {
    try {
      const summaries: ProviderSummary[] = providerConfigService.getProviderSummaries();
      const response: ApiResponse<ProviderSummary[]> = { code: 0, data: summaries, message: 'ok' };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '内部错误';
      res.status(500).json({ code: -1, data: null, message });
    }
  });

  // GET /api/settings/providers/:id — 返回单个 provider 详情（脱敏）
  router.get('/settings/providers/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const detail: ProviderDetail | null = providerConfigService.getProviderDetail(id);
      if (!detail) {
        res.status(404).json({ code: -1, data: null, message: `未找到提供商：${id}` });
        return;
      }
      const response: ApiResponse<ProviderDetail> = { code: 0, data: detail, message: 'ok' };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '内部错误';
      res.status(500).json({ code: -1, data: null, message });
    }
  });

  // POST /api/settings/providers — 创建新 provider
  router.post('/settings/providers', async (req: Request, res: Response) => {
    try {
      const { id, name, baseUrl } = req.body as CreateProviderRequest;
      if (!id || !name || !baseUrl) {
        res.status(400).json({ code: -1, data: null, message: 'id、name 和 baseUrl 为必填项' });
        return;
      }
      if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
        res.status(400).json({ code: -1, data: null, message: 'id 必须以字母开头，且仅包含小写字母、数字、连字符和下划线' });
        return;
      }
      const created = await providerConfigService.addProvider(id, name, baseUrl);
      const detail: ProviderDetail = {
        id,
        name: created.name,
        baseUrl: created.baseUrl,
        apiKey: '',
        models: [],
      };
      const response: ApiResponse<ProviderDetail> = { code: 0, data: detail, message: '提供商创建成功' };
      res.status(201).json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '内部错误';
      res.status(400).json({ code: -1, data: null, message });
    }
  });

  // DELETE /api/settings/providers/:id — 删除 provider
  router.delete('/settings/providers/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      // 不允许删除默认的 4 家
      const defaults = ['deepseek', 'openai', 'alibaba', 'anthropic'];
      if (defaults.includes(id)) {
        res.status(400).json({ code: -1, data: null, message: '不可删除内置提供商。但可以重置其配置。' });
        return;
      }
      const deleted = await providerConfigService.deleteProvider(id);
      if (!deleted) {
        res.status(404).json({ code: -1, data: null, message: `未找到提供商：${id}` });
        return;
      }
      const response: ApiResponse<null> = { code: 0, data: null, message: '提供商已删除' };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '内部错误';
      res.status(500).json({ code: -1, data: null, message });
    }
  });

  // PUT /api/settings/providers/:id — 更新 provider 配置
  router.put('/settings/providers/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const updates: UpdateProviderRequest = req.body;

      const updated = await providerConfigService.updateProvider(id, updates);
      if (!updated) {
        res.status(404).json({ code: -1, data: null, message: `未找到提供商：${id}` });
        return;
      }

      const detail: ProviderDetail = {
        id,
        name: updated.name,
        baseUrl: updated.baseUrl,
        apiKey: updated.apiKey ? updated.apiKey.slice(0, 4) + '****' + updated.apiKey.slice(-4) : '',
        models: updated.models.map((m) => ({ ...m })),
      };

      const response: ApiResponse<ProviderDetail> = { code: 0, data: detail, message: '提供商已更新' };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '内部错误';
      res.status(400).json({ code: -1, data: null, message });
    }
  });

  // PATCH /api/settings/providers/:id/key — 仅更新 API Key
  router.patch('/settings/providers/:id/key', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { apiKey } = req.body as { apiKey: string };

      if (apiKey === undefined || apiKey === null) {
        res.status(400).json({ code: -1, data: null, message: 'apiKey 为必填项' });
        return;
      }

      const updated: ProviderConfig | null = await providerConfigService.updateApiKey(id, apiKey);
      if (!updated) {
        res.status(404).json({ code: -1, data: null, message: `未找到提供商：${id}` });
        return;
      }

      const detail: ProviderDetail = {
        id,
        name: updated.name,
        baseUrl: updated.baseUrl,
        apiKey: apiKey ? apiKey.slice(0, 4) + '****' + apiKey.slice(-4) : '',
        models: updated.models.map((m) => ({ ...m })),
      };

      const response: ApiResponse<ProviderDetail> = { code: 0, data: detail, message: 'API 密钥已更新' };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '内部错误';
      res.status(400).json({ code: -1, data: null, message });
    }
  });

  return router;
}
