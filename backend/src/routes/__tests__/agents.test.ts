import { describe, it, expect, beforeEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { AgentManager } from '../../services/AgentManager.js';
import { createAgentRoutes } from '../agents.js';
import type { AgentInfo } from '../../types/index.js';

// Mock child_process.spawn
vi.mock('child_process', () => {
  const EventEmitter = require('events');
  const mockStdin = new EventEmitter();
  mockStdin.write = vi.fn();
  const mockStdout = new EventEmitter();
  const mockStderr = new EventEmitter();
  const mockProcess = new EventEmitter();
  mockProcess.pid = 99999;
  mockProcess.stdout = mockStdout;
  mockProcess.stderr = mockStderr;
  mockProcess.stdin = mockStdin;
  mockProcess.kill = vi.fn();
  mockProcess.exitCode = null;

  return {
    spawn: vi.fn(() => mockProcess),
  };
});

let agentCounter = 0;
vi.mock('uuid', () => ({
  v4: vi.fn(() => {
    agentCounter++;
    return `test-agent-${agentCounter}`;
  }),
}));

describe('Agent Routes (Integration)', () => {
  let app: express.Express;
  let agentManager: AgentManager;

  beforeEach(() => {
    agentCounter = 0;
    agentManager = new AgentManager(10);
    app = express();
    app.use(express.json());
    app.use('/api', createAgentRoutes(agentManager));
  });

  // ============ POST /api/agents ============

  describe('POST /api/agents', () => {
    it('should create a new agent successfully', async () => {
      const res = await request(app)
        .post('/api/agents')
        .send({ cwd: '/test/path', workspaceId: 'ws-001' })
        .expect(201);

      expect(res.body.code).toBe(0);
      expect(res.body.data.agent).toBeDefined();
      expect(res.body.data.agent.id).toBe('test-agent-1');
      expect(res.body.data.agent.cwd).toBe('/test/path');
      expect(res.body.data.agent.workspaceId).toBe('ws-001');
      expect(res.body.data.agent.status).toBe('running');
      expect(res.body.message).toBe('Agent created');
    });

    it('should return 400 when cwd is missing', async () => {
      const res = await request(app)
        .post('/api/agents')
        .send({ workspaceId: 'ws-001' })
        .expect(400);

      expect(res.body.code).toBe(-1);
      expect(res.body.message).toBe('cwd is required');
    });

    it('should return 400 when cwd is empty string', async () => {
      const res = await request(app)
        .post('/api/agents')
        .send({ cwd: '' })
        .expect(400);

      expect(res.body.code).toBe(-1);
    });
  });

  // ============ GET /api/agents ============

  describe('GET /api/agents', () => {
    it('should return empty list when no agents exist', async () => {
      const res = await request(app)
        .get('/api/agents')
        .expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.data).toEqual([]);
      expect(res.body.message).toBe('ok');
    });

    it('should return all created agents', async () => {
      // Create two agents
      await request(app).post('/api/agents').send({ cwd: '/cwd1' });
      await request(app).post('/api/agents').send({ cwd: '/cwd2' });

      const res = await request(app)
        .get('/api/agents')
        .expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].cwd).toBe('/cwd1');
      expect(res.body.data[1].cwd).toBe('/cwd2');
    });
  });

  // ============ DELETE /api/agents/:id ============

  describe('DELETE /api/agents/:id', () => {
    it('should delete an existing agent', async () => {
      const createRes = await request(app)
        .post('/api/agents')
        .send({ cwd: '/test' });
      const agentId = createRes.body.data.agent.id;

      const res = await request(app)
        .delete(`/api/agents/${agentId}`)
        .expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.message).toBe('Agent and descendants terminated');

      // Verify it's removed
      const listRes = await request(app).get('/api/agents');
      expect(listRes.body.data).toHaveLength(0);
    });

    it('should return 404 for non-existent agent', async () => {
      const res = await request(app)
        .delete('/api/agents/nonexistent-id')
        .expect(404);

      expect(res.body.code).toBe(-1);
      expect(res.body.message).toContain('not found');
    });
  });

  // ============ POST /api/agents/:id/stdin ============

  describe('POST /api/agents/:id/stdin', () => {
    it('should send input to agent stdin', async () => {
      const createRes = await request(app)
        .post('/api/agents')
        .send({ cwd: '/test' });
      const agentId = createRes.body.data.agent.id;

      const res = await request(app)
        .post(`/api/agents/${agentId}/stdin`)
        .send({ input: 'hello agent' })
        .expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.message).toBe('Input sent');
    });

    it('should return 400 when input is missing', async () => {
      const createRes = await request(app)
        .post('/api/agents')
        .send({ cwd: '/test' });
      const agentId = createRes.body.data.agent.id;

      const res = await request(app)
        .post(`/api/agents/${agentId}/stdin`)
        .send({})
        .expect(400);

      expect(res.body.code).toBe(-1);
      expect(res.body.message).toBe('input is required');
    });

    it('should return 400 when input is null', async () => {
      const createRes = await request(app)
        .post('/api/agents')
        .send({ cwd: '/test' });
      const agentId = createRes.body.data.agent.id;

      const res = await request(app)
        .post(`/api/agents/${agentId}/stdin`)
        .send({ input: null })
        .expect(400);

      expect(res.body.code).toBe(-1);
    });
  });

  // ============ Phase 2: POST /api/agents with parentId ============

  describe('POST /api/agents (Phase 2: parentId)', () => {
    it('should create agent with parentId', async () => {
      const res = await request(app)
        .post('/api/agents')
        .send({ cwd: '/child', parentId: 'some-parent-id' })
        .expect(201);

      expect(res.body.code).toBe(0);
      expect(res.body.data.agent.parentId).toBe('some-parent-id');
      expect(res.body.data.agent.childIds).toEqual([]);
    });

    it('should handle parentId as undefined (backward compatible)', async () => {
      const res = await request(app)
        .post('/api/agents')
        .send({ cwd: '/alone' })
        .expect(201);

      expect(res.body.data.agent.parentId).toBeNull();
    });
  });

  // ============ Phase 2: DELETE /api/agents/:id with cascade ============

  describe('DELETE /api/agents/:id (Phase 2: cascade)', () => {
    it('should cascade kill by default (cascade=true)', async () => {
      const p = await request(app).post('/api/agents').send({ cwd: '/parent' });
      const parentId = p.body.data.agent.id;
      const c = await request(app).post('/api/agents').send({ cwd: '/child', parentId });
      const childId = c.body.data.agent.id;

      const res = await request(app)
        .delete(`/api/agents/${parentId}`)
        .expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.message).toContain('descendants');

      // Both parent and child should be gone
      const list = await request(app).get('/api/agents');
      const ids = list.body.data.map((a: any) => a.id);
      expect(ids).not.toContain(parentId);
      expect(ids).not.toContain(childId);
    });

    it('should orphan children when cascade=false', async () => {
      const p = await request(app).post('/api/agents').send({ cwd: '/parent' });
      const parentId = p.body.data.agent.id;
      const c = await request(app).post('/api/agents').send({ cwd: '/child', parentId });
      const childId = c.body.data.agent.id;

      const res = await request(app)
        .delete(`/api/agents/${parentId}?cascade=false`)
        .expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.message).toContain('orphaned');

      // Parent removed, child should still exist and be orphaned
      const list = await request(app).get('/api/agents');
      const ids = list.body.data.map((a: any) => a.id);
      expect(ids).not.toContain(parentId);
      expect(ids).toContain(childId);

      const child = list.body.data.find((a: any) => a.id === childId);
      expect(child.isOrphaned).toBe(true);
      expect(child.parentId).toBeNull();
    });
  });

  // ============ Phase 2: GET /api/agents/:id/children ============

  describe('GET /api/agents/:id/children', () => {
    it('should return children of an agent', async () => {
      const p = await request(app).post('/api/agents').send({ cwd: '/parent' });
      const parentId = p.body.data.agent.id;
      await request(app).post('/api/agents').send({ cwd: '/child1', parentId });
      await request(app).post('/api/agents').send({ cwd: '/child2', parentId });

      const res = await request(app)
        .get(`/api/agents/${parentId}/children`)
        .expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.data).toHaveLength(2);
      expect(res.body.data[0].parentId).toBe(parentId);
      expect(res.body.data[1].parentId).toBe(parentId);
    });

    it('should return empty array for agent with no children', async () => {
      const r = await request(app).post('/api/agents').send({ cwd: '/loner' });
      const agentId = r.body.data.agent.id;

      const res = await request(app)
        .get(`/api/agents/${agentId}/children`)
        .expect(200);

      expect(res.body.data).toEqual([]);
    });

    it('should return empty array for non-existent agent', async () => {
      const res = await request(app)
        .get('/api/agents/nonexistent/children')
        .expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.data).toEqual([]);
    });
  });

  // ============ Phase 3: POST /api/agents with model ============

  describe('POST /api/agents (Phase 3: model)', () => {
    it('should create agent with model parameter', async () => {
      const res = await request(app)
        .post('/api/agents')
        .send({ cwd: '/test-model', model: 'gpt-4o' })
        .expect(201);

      expect(res.body.code).toBe(0);
      expect(res.body.data.agent.model).toBe('gpt-4o');
    });

    it('should handle model as undefined (backward compatible)', async () => {
      const res = await request(app)
        .post('/api/agents')
        .send({ cwd: '/no-model' })
        .expect(201);

      expect(res.body.data.agent.model).toBeUndefined();
    });
  });

  // ============ Phase 3: PUT /api/agents/:id/restart ============

  describe('PUT /api/agents/:id/restart', () => {
    it('should restart agent with new model', async () => {
      const createRes = await request(app)
        .post('/api/agents')
        .send({ cwd: '/restart-test', model: 'gpt-4o' });
      const agentId = createRes.body.data.agent.id;

      const res = await request(app)
        .put(`/api/agents/${agentId}/restart`)
        .send({ model: 'claude-3-opus' })
        .expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.message).toBe('Agent restarted with new model');
      expect(res.body.data.agent.model).toBe('claude-3-opus');
    });

    it('should return 400 when model is missing', async () => {
      const createRes = await request(app)
        .post('/api/agents')
        .send({ cwd: '/restart-test-2' });
      const agentId = createRes.body.data.agent.id;

      const res = await request(app)
        .put(`/api/agents/${agentId}/restart`)
        .send({})
        .expect(400);

      expect(res.body.code).toBe(-1);
      expect(res.body.message).toBe('model is required');
    });

    it('should return 404 for non-existent agent', async () => {
      const res = await request(app)
        .put('/api/agents/nonexistent/restart')
        .send({ model: 'gpt-4o' })
        .expect(404);

      expect(res.body.code).toBe(-1);
    });
  });
});
