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
      const message = err instanceof Error ? err.message : 'Internal error';
      res.status(500).json({ code: -1, data: null, message });
    }
  });

  // GET /api/settings/providers/:id — 返回单个 provider 详情（脱敏）
  router.get('/settings/providers/:id', (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const detail: ProviderDetail | null = providerConfigService.getProviderDetail(id);
      if (!detail) {
        res.status(404).json({ code: -1, data: null, message: `Provider not found: ${id}` });
        return;
      }
      const response: ApiResponse<ProviderDetail> = { code: 0, data: detail, message: 'ok' };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal error';
      res.status(500).json({ code: -1, data: null, message });
    }
  });

  // POST /api/settings/providers — 创建新 provider
  router.post('/settings/providers', async (req: Request, res: Response) => {
    try {
      const { id, name, baseUrl } = req.body as CreateProviderRequest;
      if (!id || !name || !baseUrl) {
        res.status(400).json({ code: -1, data: null, message: 'id, name, and baseUrl are required' });
        return;
      }
      if (!/^[a-z][a-z0-9_-]*$/.test(id)) {
        res.status(400).json({ code: -1, data: null, message: 'id must start with a letter and contain only lowercase letters, digits, hyphens, and underscores' });
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
      const response: ApiResponse<ProviderDetail> = { code: 0, data: detail, message: 'Provider created' };
      res.status(201).json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal error';
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
        res.status(400).json({ code: -1, data: null, message: 'Cannot delete built-in providers. You can reset their configuration instead.' });
        return;
      }
      const deleted = await providerConfigService.deleteProvider(id);
      if (!deleted) {
        res.status(404).json({ code: -1, data: null, message: `Provider not found: ${id}` });
        return;
      }
      const response: ApiResponse<null> = { code: 0, data: null, message: 'Provider deleted' };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal error';
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
        res.status(404).json({ code: -1, data: null, message: `Provider not found: ${id}` });
        return;
      }

      const detail: ProviderDetail = {
        id,
        name: updated.name,
        baseUrl: updated.baseUrl,
        apiKey: updated.apiKey ? updated.apiKey.slice(0, 4) + '****' + updated.apiKey.slice(-4) : '',
        models: updated.models.map((m) => ({ ...m })),
      };

      const response: ApiResponse<ProviderDetail> = { code: 0, data: detail, message: 'Provider updated' };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal error';
      res.status(400).json({ code: -1, data: null, message });
    }
  });

  // PATCH /api/settings/providers/:id/key — 仅更新 API Key
  router.patch('/settings/providers/:id/key', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { apiKey } = req.body as { apiKey: string };

      if (apiKey === undefined || apiKey === null) {
        res.status(400).json({ code: -1, data: null, message: 'apiKey is required' });
        return;
      }

      const updated: ProviderConfig | null = await providerConfigService.updateApiKey(id, apiKey);
      if (!updated) {
        res.status(404).json({ code: -1, data: null, message: `Provider not found: ${id}` });
        return;
      }

      const detail: ProviderDetail = {
        id,
        name: updated.name,
        baseUrl: updated.baseUrl,
        apiKey: apiKey ? apiKey.slice(0, 4) + '****' + apiKey.slice(-4) : '',
        models: updated.models.map((m) => ({ ...m })),
      };

      const response: ApiResponse<ProviderDetail> = { code: 0, data: detail, message: 'API key updated' };
      res.json(response);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Internal error';
      res.status(400).json({ code: -1, data: null, message });
    }
  });

  return router;
}
