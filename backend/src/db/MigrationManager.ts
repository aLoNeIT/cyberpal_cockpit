/**
 * 数据库迁移管理器
 * 管理迁移脚本的加载、执行与追踪。
 *
 * 迁移约定：
 * - 迁移文件放置在 migrations/ 目录下
 * - 文件命名：NNN_description.ts，NNN 为三位序号
 * - 每个迁移文件默认导出 { up(db), down(db) }
 * - 已执行的迁移记录在 _migrations 表中
 */

import { readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import type { DatabaseInterface } from './DatabaseInterface.js';

/** 迁移脚本接口 */
export interface Migration {
  /** 迁移名称（文件名去扩展名） */
  name: string;
  /** 执行迁移 */
  up(db: DatabaseInterface): Promise<void> | void;
  /** 回滚迁移 */
  down?(db: DatabaseInterface): Promise<void> | void;
}

export class MigrationManager {
  private db: DatabaseInterface;
  private migrationsDir: string;

  constructor(db: DatabaseInterface) {
    this.db = db;
    // migrations/ 目录与当前文件同目录
    this.migrationsDir = join(dirname(fileURLToPath(import.meta.url)), 'migrations');
  }

  /** 确保迁移追踪表存在 */
  private async ensureTrackingTable(): Promise<void> {
    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS _migrations (
        name TEXT PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )
    `);
  }

  /** 获取已执行的迁移名称列表 */
  private async getAppliedMigrations(): Promise<Set<string>> {
    await this.ensureTrackingTable();
    const rows = await this.db.query<{ name: string }>('SELECT name FROM _migrations ORDER BY name');
    return new Set(rows.map((r) => r.name));
  }

  /** 加载所有迁移脚本 */
  private async loadMigrations(): Promise<Migration[]> {
    const migrations: Migration[] = [];

    try {
      const files = readdirSync(this.migrationsDir)
        .filter((f) => /^\d{3}_.+\.(ts|js)$/.test(f))
        .sort();

      for (const file of files) {
        const modulePath = join(this.migrationsDir, file);
        // Windows 兼容: import() 需要 file:// URL
        const moduleUrl = pathToFileURL(modulePath).href;
        const mod = await import(moduleUrl);
        const migration: Migration = {
          name: file.replace(/\.(ts|js)$/, ''),
          up: mod.default?.up || mod.up,
          down: mod.default?.down || mod.down,
        };
        if (!migration.up) {
          console.warn(`[Migration] Warning: ${file} has no up() export`);
        }
        migrations.push(migration);
      }
    } catch (err) {
      console.error('[Migration] Failed to load migration files:', err);
    }

    return migrations;
  }

  /** 执行所有待处理的迁移 */
  async runMigrations(): Promise<string[]> {
    const applied = await this.getAppliedMigrations();
    const migrations = await this.loadMigrations();
    const pending = migrations.filter((m) => !applied.has(m.name));

    const executed: string[] = [];

    for (const migration of pending) {
      console.log(`[Migration] Applying: ${migration.name}`);

      await Promise.resolve(migration.up(this.db));

      // 记录迁移
      await this.db.execute(
        'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)',
        [migration.name, Date.now()]
      );

      executed.push(migration.name);
      console.log(`[Migration] Applied: ${migration.name}`);
    }

    if (executed.length === 0) {
      console.log('[Migration] Database is up to date.');
    }

    return executed;
  }

  /** 回滚最近一次迁移 */
  async rollbackLast(): Promise<string | null> {
    const applied = await this.getAppliedMigrations();
    const migrations = await this.loadMigrations();

    const lastApplied = migrations
      .filter((m) => applied.has(m.name))
      .pop();

    if (!lastApplied) {
      console.log('[Migration] No migration to rollback.');
      return null;
    }

    if (!lastApplied.down) {
      console.log(`[Migration] Migration ${lastApplied.name} has no down() method, skipping.`);
      return null;
    }

    console.log(`[Migration] Rolling back: ${lastApplied.name}`);
    await Promise.resolve(lastApplied.down(this.db));

    await this.db.execute('DELETE FROM _migrations WHERE name = ?', [lastApplied.name]);
    console.log(`[Migration] Rolled back: ${lastApplied.name}`);

    return lastApplied.name;
  }

  /** 获取迁移状态列表 */
  async getStatus(): Promise<Array<{ name: string; applied: boolean }>> {
    const applied = await this.getAppliedMigrations();
    const migrations = await this.loadMigrations();

    return migrations.map((m) => ({
      name: m.name,
      applied: applied.has(m.name),
    }));
  }
}
