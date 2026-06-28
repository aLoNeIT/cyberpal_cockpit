import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { createDemoTerminalRoutes } from '../demoTerminal.js';

describe('Demo Terminal Routes', () => {
  let app: express.Express;
  let tempDir: string;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api', createDemoTerminalRoutes());

    tempDir = join(tmpdir(), `cpc-demo-terminal-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('returns files, directories, and dotfiles for a directory', async () => {
    mkdirSync(join(tempDir, 'src'));
    mkdirSync(join(tempDir, 'src', 'components'));
    writeFileSync(join(tempDir, 'src', 'index.ts'), 'export {};');
    writeFileSync(join(tempDir, 'readme.md'), '# Readme');
    writeFileSync(join(tempDir, '.env'), 'TOKEN=test');

    const res = await request(app)
      .get('/api/demo-terminal/list')
      .query({ path: tempDir })
      .expect(200);

    expect(res.body.code).toBe(0);
    expect(res.body.message).toBe('ok');
    expect(res.body.data.path).toBe(tempDir);
    expect(res.body.data.parentPath).toBeTruthy();

    const entries = res.body.data.entries as Array<{
      name: string;
      type: string;
      size: number;
      modifiedAt: number;
      hasChildren?: boolean;
      children?: Array<{ name: string; type: string }>;
    }>;
    expect(entries.map((entry) => entry.name)).toContain('src');
    expect(entries.map((entry) => entry.name)).toContain('readme.md');
    expect(entries.map((entry) => entry.name)).toContain('.env');
    expect(entries.find((entry) => entry.name === 'src')?.type).toBe('directory');
    expect(entries.find((entry) => entry.name === 'src')?.hasChildren).toBe(true);
    expect(entries.find((entry) => entry.name === 'src')?.children?.map((entry) => entry.name)).toEqual([
      'components',
      'index.ts',
    ]);
    expect(entries.find((entry) => entry.name === 'readme.md')?.type).toBe('file');
    expect(typeof entries.find((entry) => entry.name === 'readme.md')?.size).toBe('number');
    expect(typeof entries.find((entry) => entry.name === 'readme.md')?.modifiedAt).toBe('number');
  });

  it('returns only one nested level per request for directory children', async () => {
    mkdirSync(join(tempDir, 'src', 'components'), { recursive: true });
    mkdirSync(join(tempDir, 'src', 'components', 'deep'));
    writeFileSync(join(tempDir, 'src', 'components', 'Button.vue'), '<template />');

    const res = await request(app)
      .get('/api/demo-terminal/list')
      .query({ path: tempDir })
      .expect(200);

    const src = res.body.data.entries.find((entry: { name: string }) => entry.name === 'src');
    const components = src.children.find((entry: { name: string }) => entry.name === 'components');

    expect(components.hasChildren).toBe(true);
    expect(components.children).toBeUndefined();
  });

  it('omits preloaded children for large directories', async () => {
    mkdirSync(join(tempDir, 'node_modules'));
    for (let i = 0; i < 60; i++) {
      writeFileSync(join(tempDir, 'node_modules', `pkg-${i}.txt`), 'x');
    }

    const res = await request(app)
      .get('/api/demo-terminal/list')
      .query({ path: tempDir })
      .expect(200);

    const nodeModules = res.body.data.entries.find((entry: { name: string }) => entry.name === 'node_modules');

    expect(nodeModules.hasChildren).toBe(true);
    expect(nodeModules.children).toBeUndefined();
  });

  it('sorts directories before files and sorts each group by name', async () => {
    mkdirSync(join(tempDir, 'zeta'));
    mkdirSync(join(tempDir, 'alpha'));
    writeFileSync(join(tempDir, 'z.txt'), 'z');
    writeFileSync(join(tempDir, 'a.txt'), 'a');

    const res = await request(app)
      .get('/api/demo-terminal/list')
      .query({ path: tempDir })
      .expect(200);

    expect(res.body.data.entries.map((entry: { name: string }) => entry.name)).toEqual([
      'alpha',
      'zeta',
      'a.txt',
      'z.txt',
    ]);
  });

  it('returns 400 when path query is missing', async () => {
    const res = await request(app)
      .get('/api/demo-terminal/list')
      .expect(400);

    expect(res.body.code).toBe(-1);
    expect(res.body.message).toContain('path');
  });

  it('returns 400 when path does not exist', async () => {
    const res = await request(app)
      .get('/api/demo-terminal/list')
      .query({ path: join(tempDir, 'missing') })
      .expect(400);

    expect(res.body.code).toBe(-1);
  });
});
