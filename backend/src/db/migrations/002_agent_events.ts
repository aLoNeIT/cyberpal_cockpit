import type { DatabaseInterface } from '../DatabaseInterface.js';

export async function up(db: DatabaseInterface): Promise<void> {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS agent_events (
      id TEXT PRIMARY KEY,
      agent_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      title TEXT,
      content TEXT NOT NULL DEFAULT '',
      status TEXT,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    )
  `);
  await db.execute('CREATE INDEX IF NOT EXISTS idx_agent_events_agent ON agent_events(agent_id, created_at)');
}

export async function down(db: DatabaseInterface): Promise<void> {
  await db.execute('DROP TABLE IF EXISTS agent_events');
}
