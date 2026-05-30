/**
 * SQLite 数据库适配器 — 基于 better-sqlite3
 * 用于本地开发 / 单机部署场景。
 *
 * better-sqlite3 是同步 API，此处包装为 Promise 返回以匹配 DatabaseInterface。
 */

import Database from 'better-sqlite3';
import type { Database as SQLiteDatabase } from 'better-sqlite3';
import type { DatabaseInterface, QueryResult } from './DatabaseInterface.js';
import { ensureDbDir } from './index.js';

export class SQLiteAdapter implements DatabaseInterface {
  private db: SQLiteDatabase;
  public readonly adapterName: string = 'sqlite';

  constructor(dbPath: string) {
    ensureDbDir(dbPath);
    this.db = new Database(dbPath);

    // 启用 WAL 模式提升并发性能
    this.db.pragma('journal_mode = WAL');
    // 启用外键约束
    this.db.pragma('foreign_keys = ON');
  }

  async execute(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const stmt = this.db.prepare(sql);
    const info = stmt.run(...params);
    return {
      changes: info.changes,
      lastInsertRowid: info.lastInsertRowid,
    };
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const stmt = this.db.prepare(sql);
    return stmt.all(...params) as T[];
  }

  async queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const stmt = this.db.prepare(sql);
    return stmt.get(...params) as T | undefined;
  }

  async transaction<T>(fn: () => T): Promise<T> {
    const tx = this.db.transaction(fn);
    return tx();
  }

  close(): void {
    this.db.close();
  }
}
