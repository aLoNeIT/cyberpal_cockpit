import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { WorkspaceService } from '../../services/WorkspaceService.js';
import { FileWatcher } from '../../services/FileWatcher.js';
import { WorkspaceRepository } from '../../db/repositories/WorkspaceRepository.js';
import { createWorkspaceRoutes } from '../workspaces.js';
import type { WorkspaceConfig } from '../../types/index.js';

// Mock uuid
let uuidCounter = 0;
vi.mock('uuid', () => ({
  v4: vi.fn(() => {
    uuidCounter++;
    return `test-ws-${uuidCounter}`;
  }),
}));

// Mock FileWatcher
vi.mock('../../services/FileWatcher.js', () => {
  const MockFileWatcher = vi.fn(() => ({
    watch: vi.fn(),
    unwatch: vi.fn(),
    isWatching: vi.fn(() => true),
    onChange: null,
  }));
  return { FileWatcher: MockFileWatcher };
});

// Mock WorkspaceRepository
function createMockWorkspaceRepo(): WorkspaceRepository {
  const store = new Map<string, WorkspaceConfig>();

  const mockRepo = {
    findAll: vi.fn(async () => Array.from(store.values())),
    findById: vi.fn(async (id: string) => store.get(id)),
    findByPath: vi.fn(async (filePath: string) => {
      for (const ws of store.values()) {
        if (ws.path === filePath) return ws;
      }
      return undefined;
    }),
    create: vi.fn(async (ws: WorkspaceConfig) => {
      store.set(ws.id, { ...ws });
      return { ...ws };
    }),
    deleteById: vi.fn(async (id: string) => {
      const existed = store.has(id);
      store.delete(id);
      return existed;
    }),
    count: vi.fn(async () => store.size),
  };

  return mockRepo as unknown as WorkspaceRepository;
}

describe('Workspace Routes (Integration)', () => {
  let app: express.Express;
  let workspaceService: WorkspaceService;
  let fileWatcher: any;
  let mockRepo: WorkspaceRepository;
  let tempDir: string;

  beforeEach(() => {
    uuidCounter = 0;
    workspaceService = new WorkspaceService();
    mockRepo = createMockWorkspaceRepo();
    fileWatcher = {
      watch: vi.fn(),
      unwatch: vi.fn(),
      isWatching: vi.fn(() => true),
      onChange: null,
    };
    app = express();
    app.use(express.json());
    app.use('/api', createWorkspaceRoutes(workspaceService, fileWatcher as any, mockRepo));

    tempDir = join(tmpdir(), `cpc-test-ws-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
    writeFileSync(join(tempDir, 'test.txt'), 'test content');
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  // ============ GET /api/workspaces ============

  describe('GET /api/workspaces', () => {
    it('should return empty list initially', async () => {
      const res = await request(app)
        .get('/api/workspaces')
        .expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.data).toEqual([]);
    });

    it('should return created workspaces', async () => {
      await request(app)
        .post('/api/workspaces')
        .send({ name: 'My Project', path: tempDir });

      const res = await request(app)
        .get('/api/workspaces')
        .expect(200);

      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].name).toBe('My Project');
      expect(res.body.data[0].path).toBe(tempDir);
    });
  });

  // ============ POST /api/workspaces ============

  describe('POST /api/workspaces', () => {
    it('should create a workspace successfully', async () => {
      const res = await request(app)
        .post('/api/workspaces')
        .send({ name: 'Test WS', path: tempDir })
        .expect(201);

      expect(res.body.code).toBe(0);
      expect(res.body.data.id).toBeDefined();
      expect(res.body.data.id).toMatch(/^test-ws-/);
      expect(res.body.data.name).toBe('Test WS');
      expect(res.body.data.path).toBe(tempDir);
      expect(typeof res.body.data.createdAt).toBe('number');
      expect(res.body.message).toBe('Workspace created');
    });

    it('should return 400 when name is missing', async () => {
      const res = await request(app)
        .post('/api/workspaces')
        .send({ path: tempDir })
        .expect(400);

      expect(res.body.code).toBe(-1);
      expect(res.body.message).toBe('name and path are required');
    });

    it('should return 400 when path is missing', async () => {
      const res = await request(app)
        .post('/api/workspaces')
        .send({ name: 'Test' })
        .expect(400);

      expect(res.body.code).toBe(-1);
    });

    it('should return 400 for invalid path', async () => {
      const res = await request(app)
        .post('/api/workspaces')
        .send({ name: 'Invalid', path: '/nonexistent/path/xyz' })
        .expect(400);

      expect(res.body.code).toBe(-1);
      expect(res.body.message).toContain('Path does not exist');
    });
  });

  // ============ DELETE /api/workspaces/:id ============

  describe('DELETE /api/workspaces/:id', () => {
    it('should delete an existing workspace', async () => {
      const createRes = await request(app)
        .post('/api/workspaces')
        .send({ name: 'To Delete', path: tempDir });
      const wsId = createRes.body.data.id;

      const res = await request(app)
        .delete(`/api/workspaces/${wsId}`)
        .expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.message).toBe('Workspace deleted');

      const listRes = await request(app).get('/api/workspaces');
      const ids = listRes.body.data.map((w: any) => w.id);
      expect(ids).not.toContain(wsId);
    });

    it('should return 404 for non-existent workspace', async () => {
      const res = await request(app)
        .delete('/api/workspaces/nonexistent')
        .expect(404);

      expect(res.body.code).toBe(-1);
      expect(res.body.message).toBe('Workspace not found');
    });
  });

  // ============ GET /api/workspaces/:id/tree ============

  describe('GET /api/workspaces/:id/tree', () => {
    it('should return directory tree', async () => {
      const createRes = await request(app)
        .post('/api/workspaces')
        .send({ name: 'Tree Test', path: tempDir });
      const wsId = createRes.body.data.id;

      const res = await request(app)
        .get(`/api/workspaces/${wsId}/tree`)
        .expect(200);

      expect(res.body.code).toBe(0);
      expect(Array.isArray(res.body.data)).toBe(true);
      const names = res.body.data.map((n: any) => n.name);
      expect(names).toContain('test.txt');
    });

    it('should return 404 for non-existent workspace', async () => {
      const res = await request(app)
        .get('/api/workspaces/nonexistent/tree')
        .expect(404);

      expect(res.body.code).toBe(-1);
    });
  });

  // ============ GET /api/files/content ============

  describe('GET /api/files/content', () => {
    it('should return file content and language', async () => {
      const res = await request(app)
        .get('/api/files/content')
        .query({ path: join(tempDir, 'test.txt') })
        .expect(200);

      expect(res.body.code).toBe(0);
      expect(res.body.data.content).toBe('test content');
      expect(res.body.data.path).toBe(join(tempDir, 'test.txt'));
      expect(res.body.data.language).toBe('plaintext');
    });

    it('should detect language for .ts files', async () => {
      const tsFile = join(tempDir, 'sample.ts');
      writeFileSync(tsFile, 'const x: number = 1;');

      const res = await request(app)
        .get('/api/files/content')
        .query({ path: tsFile })
        .expect(200);

      expect(res.body.data.language).toBe('typescript');
    });

    it('should return 400 when path query is missing', async () => {
      const res = await request(app)
        .get('/api/files/content')
        .expect(400);

      expect(res.body.code).toBe(-1);
      expect(res.body.message).toBe('path query parameter is required');
    });

    it('should return 400 for non-existent file', async () => {
      const res = await request(app)
        .get('/api/files/content')
        .query({ path: join(tempDir, 'nonexistent.txt') })
        .expect(400);

      expect(res.body.code).toBe(-1);
      expect(res.body.message).toContain('Invalid path');
    });
  });
});
