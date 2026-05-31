import { describe, expect, it, vi } from 'vitest';
import { TokenRepository } from '../TokenRepository.js';
import type { DatabaseInterface, QueryResult } from '../../DatabaseInterface.js';

function makeDb(rows: unknown[] = [], row: unknown = undefined): DatabaseInterface {
  return {
    adapterName: 'sqlite',
    execute: vi.fn().mockResolvedValue({ changes: 1, lastInsertRowid: 1 } satisfies QueryResult),
    query: vi.fn().mockResolvedValue(rows),
    queryOne: vi.fn().mockResolvedValue(row),
    transaction: vi.fn(),
    close: vi.fn(),
  };
}

describe('TokenRepository', () => {
  it('inserts cache and cost columns with daily token records', async () => {
    const db = makeDb();
    const repo = new TokenRepository(db);

    await repo.insert({
      date: '2026-05-31',
      agentId: 'agent-1',
      workspaceId: 'workspace-1',
      model: 'gpt-5.5',
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 1000,
      cacheWriteTokens: 25,
      cumulativeTokens: 175,
      costUsd: 0.012345,
    });

    const [sql, params] = vi.mocked(db.execute).mock.calls[0];
    expect(sql).toContain('cache_read_tokens');
    expect(sql).toContain('cache_write_tokens');
    expect(sql).toContain('cost_usd');
    expect(params).toEqual([
      '2026-05-31',
      'agent-1',
      'workspace-1',
      'gpt-5.5',
      100,
      50,
      1000,
      25,
      175,
      0.012345,
      expect.any(Number),
    ]);
  });

  it('maps cache and cost columns when querying records', async () => {
    const db = makeDb([
      {
        id: 1,
        date: '2026-05-31',
        agent_id: 'agent-1',
        workspace_id: 'workspace-1',
        model: 'gpt-5.5',
        input_tokens: 100,
        output_tokens: 50,
        cache_read_tokens: 1000,
        cache_write_tokens: 25,
        cumulative_tokens: 175,
        cost_usd: 0.012345,
        created_at: 1,
      },
    ]);
    const repo = new TokenRepository(db);

    const records = await repo.query({});

    expect(records[0]).toMatchObject({
      cacheReadTokens: 1000,
      cacheWriteTokens: 25,
      costUsd: 0.012345,
    });
  });
});
