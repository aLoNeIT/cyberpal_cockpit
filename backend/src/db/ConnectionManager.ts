/**
 * 数据库连接管理器
 * 根据配置选择 SQLite 或 MySQL 适配器，并统一初始化与关闭。
 */

import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import type { DatabaseInterface } from './DatabaseInterface.js';
import { SQLiteAdapter } from './SQLiteAdapter.js';
import { MySQLAdapter, MySQLConfig } from './MySQLAdapter.js';
import { MigrationManager } from './MigrationManager.js';

export type DBDriver = 'sqlite' | 'mysql';

export interface DBConfig {
  driver: DBDriver;
  /** SQLite 数据库文件路径 */
  sqlitePath?: string;
  /** MySQL 连接配置 */
  mysql?: MySQLConfig;
  /** 是否在启动时自动运行迁移 */
  autoMigrate?: boolean;
}

const DEFAULT_CONFIG: DBConfig = {
  driver: (process.env.DB_DRIVER as DBDriver) || 'sqlite',
  sqlitePath: process.env.DB_SQLITE_PATH || join(homedir(), '.cyberpal-cockpit', 'cpc.db'),
  mysql: process.env.DB_MYSQL_HOST ? {
    host: process.env.DB_MYSQL_HOST,
    port: parseInt(process.env.DB_MYSQL_PORT || '3306', 10),
    user: process.env.DB_MYSQL_USER || 'root',
    password: process.env.DB_MYSQL_PASSWORD || '',
    database: process.env.DB_MYSQL_DATABASE || 'cyberpal_cockpit',
  } : undefined,
  autoMigrate: true,
};

export class ConnectionManager {
  private static instance: ConnectionManager | null = null;
  private _db: DatabaseInterface | null = null;
  private _config: DBConfig;

  private constructor(config?: Partial<DBConfig>) {
    this._config = { ...DEFAULT_CONFIG, ...config };
  }

  /** 获取单例 */
  static getInstance(config?: Partial<DBConfig>): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager(config);
    }
    return ConnectionManager.instance;
  }

  /** 获取数据库接口实例（延迟初始化） */
  get db(): DatabaseInterface {
    if (!this._db) {
      this._db = this.createAdapter();
    }
    return this._db;
  }

  /** 初始化数据库并运行迁移 */
  async initialize(): Promise<void> {
    // 触发延迟初始化
    const db = this.db;

    // 确保 SQLite 目录存在
    if (this._config.driver === 'sqlite' && this._config.sqlitePath) {
      const dir = dirname(this._config.sqlitePath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
    }

    // 自动运行迁移
    if (this._config.autoMigrate) {
      const migrationManager = new MigrationManager(db);
      await migrationManager.runMigrations();
    }
  }

  /** 关闭数据库连接 */
  async close(): Promise<void> {
    if (this._db) {
      const result = this._db.close();
      if (result instanceof Promise) {
        await result;
      }
      this._db = null;
    }
  }

  /** 获取配置 */
  get config(): DBConfig {
    return { ...this._config };
  }

  /** 重置单例（仅用于测试） */
  static resetInstance(): void {
    if (ConnectionManager.instance) {
      const inst = ConnectionManager.instance;
      if (inst._db) {
        const result = inst._db.close();
        if (result instanceof Promise) {
          result.catch(() => {});
        }
        inst._db = null;
      }
      ConnectionManager.instance = null;
    }
  }

  private createAdapter(): DatabaseInterface {
    if (this._config.driver === 'mysql' && this._config.mysql) {
      return new MySQLAdapter(this._config.mysql);
    }

    // 默认使用 SQLite
    const dbPath = this._config.sqlitePath || join(homedir(), '.cyberpal-cockpit', 'cpc.db');
    return new SQLiteAdapter(dbPath);
  }
}
