import type { DatabaseInterface } from '../DatabaseInterface.js';

export async function up(db: DatabaseInterface): Promise<void> {
  if (!(await hasColumn(db, 'visible'))) {
    await db.execute('ALTER TABLE provider_configs ADD COLUMN visible INTEGER NOT NULL DEFAULT 1');
  }
}

export async function down(_db: DatabaseInterface): Promise<void> {
  // 保留列，避免在 SQLite/MySQL 上做破坏性回滚。
}

async function hasColumn(db: DatabaseInterface, columnName: string): Promise<boolean> {
  if (db.adapterName === 'mysql') {
    const row = await db.queryOne<{ Field?: string }>(
      'SHOW COLUMNS FROM provider_configs LIKE ?',
      [columnName],
    );
    return Boolean(row);
  }

  const rows = await db.query<{ name: string }>('PRAGMA table_info(provider_configs)');
  return rows.some((row) => row.name === columnName);
}
