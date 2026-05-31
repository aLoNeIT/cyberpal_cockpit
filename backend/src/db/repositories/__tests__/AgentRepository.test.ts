import { describe, expect, it, vi } from 'vitest';
import { AgentRepository } from '../AgentRepository.js';
import type { DatabaseInterface, QueryResult } from '../../DatabaseInterface.js';
import type { AgentInfo } from '../../../types/index.js';

function makeDb(existing: unknown = undefined): DatabaseInterface {
  return {
    adapterName: 'mysql',
    execute: vi.fn().mockResolvedValue({ changes: 1, lastInsertRowid: 0 } satisfies QueryResult),
    query: vi.fn().mockResolvedValue([]),
    queryOne: vi.fn().mockResolvedValue(existing),
    transaction: vi.fn(),
    close: vi.fn(),
  };
}

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    id: 'agent-1',
    cwd: '/workspace',
    status: 'running',
    pid: 123,
    workspaceId: 'workspace-1',
    createdAt: 1000,
    parentId: null,
    childIds: [],
    isOrphaned: false,
    taskDescription: 'Continue task',
    model: 'gpt-5.5',
    sessionFile: 'E:\\sessions\\agent-1.jsonl',
    sessionId: 'session-1',
    ...overrides,
  };
}

describe('AgentRepository', () => {
  it('updates an existing agent with portable SQL instead of SQLite-only upsert syntax', async () => {
    const db = makeDb({ id: 'agent-1' });
    const repo = new AgentRepository(db);

    await repo.insert(makeAgent());

    expect(db.queryOne).toHaveBeenCalledWith('SELECT * FROM agents WHERE id = ?', ['agent-1']);
    expect(db.execute).toHaveBeenCalledTimes(1);
    const [sql, params] = vi.mocked(db.execute).mock.calls[0];
    expect(sql).toContain('UPDATE agents SET');
    expect(sql).not.toContain('ON CONFLICT');
    expect(params).toEqual([
      '/workspace',
      'running',
      123,
      'workspace-1',
      null,
      'Continue task',
      'gpt-5.5',
      'E:\\sessions\\agent-1.jsonl',
      'session-1',
      'agent-1',
    ]);
  });

  it('inserts a new agent with session metadata using portable SQL', async () => {
    const db = makeDb(undefined);
    const repo = new AgentRepository(db);

    await repo.insert(makeAgent({ id: 'agent-new' }));

    expect(db.queryOne).toHaveBeenCalledWith('SELECT * FROM agents WHERE id = ?', ['agent-new']);
    expect(db.execute).toHaveBeenCalledTimes(1);
    const [sql, params] = vi.mocked(db.execute).mock.calls[0];
    expect(sql).toContain('INSERT INTO agents');
    expect(sql).not.toContain('ON CONFLICT');
    expect(params).toEqual([
      'agent-new',
      '/workspace',
      'running',
      123,
      'workspace-1',
      null,
      'Continue task',
      'gpt-5.5',
      'E:\\sessions\\agent-1.jsonl',
      'session-1',
      1000,
    ]);
  });
});
