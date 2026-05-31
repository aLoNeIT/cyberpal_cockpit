import { describe, expect, it, vi } from 'vitest';
import { down, up } from '../003_agent_session_metadata.js';
import type { DatabaseInterface, QueryResult } from '../../DatabaseInterface.js';

function makeDb(adapterName: string): DatabaseInterface {
  return {
    adapterName,
    execute: vi.fn().mockResolvedValue({ changes: 1, lastInsertRowid: 0 } satisfies QueryResult),
    query: vi.fn().mockResolvedValue([]),
    queryOne: vi.fn().mockResolvedValue(undefined),
    transaction: vi.fn(),
    close: vi.fn(),
  };
}

describe('003_agent_session_metadata migration', () => {
  it('uses SQLite-compatible index syntax for SQLite', async () => {
    const db = makeDb('sqlite');

    await up(db);
    await down(db);

    expect(db.execute).toHaveBeenCalledWith('CREATE INDEX IF NOT EXISTS idx_agents_session_file ON agents(session_file)');
    expect(db.execute).toHaveBeenCalledWith('DROP INDEX IF EXISTS idx_agents_session_file');
  });

  it('uses MySQL-compatible index syntax for MySQL', async () => {
    const db = makeDb('mysql');

    await up(db);
    await down(db);

    expect(db.execute).toHaveBeenCalledWith('CREATE INDEX idx_agents_session_file ON agents(session_file)');
    expect(db.execute).toHaveBeenCalledWith('DROP INDEX idx_agents_session_file ON agents');
  });
});
