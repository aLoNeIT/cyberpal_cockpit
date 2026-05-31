import type { DatabaseInterface } from '../DatabaseInterface.js';

export async function up(db: DatabaseInterface): Promise<void> {
  if (!(await hasColumn(db, 'cache_read_tokens'))) {
    await db.execute('ALTER TABLE token_records ADD COLUMN cache_read_tokens INTEGER NOT NULL DEFAULT 0');
  }
  if (!(await hasColumn(db, 'cache_write_tokens'))) {
    await db.execute('ALTER TABLE token_records ADD COLUMN cache_write_tokens INTEGER NOT NULL DEFAULT 0');
  }
  if (!(await hasColumn(db, 'cost_usd'))) {
    await db.execute('ALTER TABLE token_records ADD COLUMN cost_usd REAL NOT NULL DEFAULT 0');
  }
}

export async function down(_db: DatabaseInterface): Promise<void> {
  // Column rollback is intentionally omitted for SQLite compatibility.
}

async function hasColumn(db: DatabaseInterface, columnName: string): Promise<boolean> {
  if (db.adapterName === 'mysql') {
    const row = await db.queryOne<{ Field?: string }>(
      'SHOW COLUMNS FROM token_records LIKE ?',
      [columnName],
    );
    return Boolean(row);
  }

  const rows = await db.query<{ name: string }>('PRAGMA table_info(token_records)');
  return rows.some((row) => row.name === columnName);
}
