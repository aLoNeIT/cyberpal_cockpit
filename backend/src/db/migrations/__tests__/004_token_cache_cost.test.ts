import { describe, expect, it, vi } from 'vitest';
import { up } from '../004_token_cache_cost.js';
import type { DatabaseInterface, QueryResult } from '../../DatabaseInterface.js';

function makeDb(existingColumns: string[] = []): DatabaseInterface {
  return {
    adapterName: 'sqlite',
    execute: vi.fn().mockResolvedValue({ changes: 1, lastInsertRowid: 0 } satisfies QueryResult),
    query: vi.fn().mockResolvedValue(existingColumns.map((name) => ({ name }))),
    queryOne: vi.fn().mockResolvedValue(undefined),
    transaction: vi.fn(),
    close: vi.fn(),
  };
}

describe('004_token_cache_cost migration', () => {
  it('adds cache and cost columns to token records', async () => {
    const db = makeDb();

    await up(db);

    expect(db.execute).toHaveBeenCalledWith('ALTER TABLE token_records ADD COLUMN cache_read_tokens INTEGER NOT NULL DEFAULT 0');
    expect(db.execute).toHaveBeenCalledWith('ALTER TABLE token_records ADD COLUMN cache_write_tokens INTEGER NOT NULL DEFAULT 0');
    expect(db.execute).toHaveBeenCalledWith('ALTER TABLE token_records ADD COLUMN cost_usd REAL NOT NULL DEFAULT 0');
  });

  it('skips columns that already exist so fresh schemas can still run all migrations', async () => {
    const db = makeDb(['cache_read_tokens', 'cache_write_tokens', 'cost_usd']);

    await up(db);

    expect(db.execute).not.toHaveBeenCalled();
  });
});
