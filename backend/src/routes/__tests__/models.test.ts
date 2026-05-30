import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createModelRoutes } from '../models.js';

describe('Model Routes', () => {
  let app: express.Express;

  beforeEach(() => {
    app = express();
    const router = createModelRoutes();
    app.use('/api', router);
  });

  // ============ GET /api/models ============

  describe('GET /api/models', () => {
    it('should return 8 models', async () => {
      const res = await request(app).get('/api/models').expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveLength(8);
    });

    it('should include default model marked as isDefault', async () => {
      const res = await request(app).get('/api/models').expect(200);

      const defaultModel = res.body.data.find((m: any) => m.isDefault === true);
      expect(defaultModel).toBeDefined();
      expect(defaultModel.id).toBe('deepseek-chat');
    });

    it('should return models with correct shape', async () => {
      const res = await request(app).get('/api/models').expect(200);

      for (const model of res.body.data) {
        expect(model).toHaveProperty('id');
        expect(model).toHaveProperty('name');
        expect(model).toHaveProperty('provider');
        expect(model).toHaveProperty('isDefault');
        expect(typeof model.id).toBe('string');
        expect(typeof model.name).toBe('string');
        expect(typeof model.provider).toBe('string');
        expect(typeof model.isDefault).toBe('boolean');
      }
    });

    it('should have exactly one default model', async () => {
      const res = await request(app).get('/api/models').expect(200);

      const defaults = res.body.data.filter((m: any) => m.isDefault);
      expect(defaults).toHaveLength(1);
    });

    it('should include DeepSeek, Alibaba, OpenAI, Anthropic providers', async () => {
      const res = await request(app).get('/api/models').expect(200);

      const providers = new Set(res.body.data.map((m: any) => m.provider));
      expect(providers.has('DeepSeek')).toBe(true);
      expect(providers.has('Alibaba')).toBe(true);
      expect(providers.has('OpenAI')).toBe(true);
      expect(providers.has('Anthropic')).toBe(true);
    });

    it('should contain specific expected model IDs', async () => {
      const res = await request(app).get('/api/models').expect(200);

      const ids = res.body.data.map((m: any) => m.id);
      expect(ids).toContain('deepseek-chat');
      expect(ids).toContain('deepseek-reasoner');
      expect(ids).toContain('qwen-plus');
      expect(ids).toContain('qwen-max');
      expect(ids).toContain('gpt-4o');
      expect(ids).toContain('gpt-4o-mini');
      expect(ids).toContain('claude-3.5-sonnet');
      expect(ids).toContain('claude-3-opus');
    });
  });
});
