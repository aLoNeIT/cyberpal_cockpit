import type { DatabaseInterface } from '../DatabaseInterface.js';

export async function up(db: DatabaseInterface): Promise<void> {
  await db.execute('ALTER TABLE agents ADD COLUMN session_file TEXT');
  await db.execute('ALTER TABLE agents ADD COLUMN session_id TEXT');
  if (db.adapterName === 'mysql') {
    await db.execute('CREATE INDEX idx_agents_session_file ON agents(session_file)');
  } else {
    await db.execute('CREATE INDEX IF NOT EXISTS idx_agents_session_file ON agents(session_file)');
  }
}

export async function down(db: DatabaseInterface): Promise<void> {
  if (db.adapterName === 'mysql') {
    await db.execute('DROP INDEX idx_agents_session_file ON agents');
  } else {
    await db.execute('DROP INDEX IF EXISTS idx_agents_session_file');
  }
}
