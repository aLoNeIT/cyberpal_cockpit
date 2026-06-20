/**
 * 迁移 001：初始数据库 schema
 * 创建核心业务表：workspaces、agents、token_records、provider_configs
 */

import type { DatabaseInterface } from '../DatabaseInterface.js';

export async function up(db: DatabaseInterface): Promise<void> {
  // ========== 工作区表 ==========
  await db.execute(`
    CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL
    )
  `);

  // ========== Agent 记录表（历史 / 审计日志） ==========
  await db.execute(`
    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      cwd TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'stopped',
      pid INTEGER,
      workspace_id TEXT,
      parent_id TEXT,
      task_description TEXT,
      model TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE SET NULL
    )
  `);
  await db.execute('CREATE INDEX IF NOT EXISTS idx_agents_workspace ON agents(workspace_id)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_agents_parent ON agents(parent_id)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status)');

  // ========== Token 消耗记录表 ==========
  await db.execute(`
    CREATE TABLE IF NOT EXISTS token_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      workspace_id TEXT,
      model TEXT NOT NULL DEFAULT 'unknown',
      input_tokens INTEGER NOT NULL DEFAULT 0,
      output_tokens INTEGER NOT NULL DEFAULT 0,
      cache_read_tokens INTEGER NOT NULL DEFAULT 0,
      cache_write_tokens INTEGER NOT NULL DEFAULT 0,
      cumulative_tokens INTEGER NOT NULL DEFAULT 0,
      cost_usd REAL NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `);
  await db.execute('CREATE INDEX IF NOT EXISTS idx_token_records_date ON token_records(date)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_token_records_agent ON token_records(agent_id)');
  await db.execute('CREATE INDEX IF NOT EXISTS idx_token_records_workspace ON token_records(workspace_id)');

  // ========== 提供商配置表 ==========
  await db.execute(`
    CREATE TABLE IF NOT EXISTS provider_configs (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      base_url TEXT NOT NULL,
      api_key TEXT NOT NULL DEFAULT '',
      visible INTEGER NOT NULL DEFAULT 1,
      models TEXT NOT NULL DEFAULT '[]',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  // ========== 设置表（通用键值对存储） ==========
  await db.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  console.log('[Migration 001] Initial schema created: workspaces, agents, token_records, provider_configs, settings');
}

export async function down(db: DatabaseInterface): Promise<void> {
  db.execute('DROP TABLE IF EXISTS token_records');
  db.execute('DROP TABLE IF EXISTS agents');
  db.execute('DROP TABLE IF EXISTS provider_configs');
  db.execute('DROP TABLE IF EXISTS settings');
  db.execute('DROP TABLE IF EXISTS workspaces');
  console.log('[Migration 001] All tables dropped');
}
