/**
 * MySQL 数据库适配器 — 基于 mysql2/promise
 * 用于生产环境 / 多实例部署场景。
 *
 * mysql2/promise 原生返回 Promise，与 DatabaseInterface 的异步定义天然契合。
 */

import mysql, { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { DatabaseInterface, QueryResult } from './DatabaseInterface.js';

export interface MySQLConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export class MySQLAdapter implements DatabaseInterface {
  private pool: Pool;
  public readonly adapterName: string = 'mysql';

  constructor(config: MySQLConfig) {
    this.pool = mysql.createPool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4',
    });
  }

  async execute(sql: string, params: unknown[] = []): Promise<QueryResult> {
    const [result] = await this.pool.execute<ResultSetHeader>(sql, params as any[]);
    return {
      changes: result.affectedRows,
      lastInsertRowid: result.insertId,
    };
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(sql, params as any[]);
    return rows as T[];
  }

  async queryOne<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(sql, params as any[]);
    if (rows.length === 0) return undefined;
    return rows[0] as T;
  }

  async transaction<T>(_fn: () => T): Promise<T> {
    throw new Error(
      'MySQLAdapter.transaction() is not directly supported. ' +
      'Use pool.getConnection() + beginTransaction/commit/rollback for transactional work.'
    );
  }

  /** 获取底层连接池（供 repository 层实现自定义事务） */
  getPool(): Pool {
    return this.pool;
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
