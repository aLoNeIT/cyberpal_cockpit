/**
 * 数据库抽象接口 — 定义所有 repository 层需要的数据库操作。
 * 所有方法均为异步（返回 Promise），以同时兼容 SQLite（同步包装）和 MySQL（原生异步）。
 */

export interface QueryResult {
  /** 受影响行数（INSERT/UPDATE/DELETE）或查询行数 */
  changes: number;
  /** 最后插入的 rowid（INSERT 后有效） */
  lastInsertRowid: number | bigint;
}

export interface DatabaseInterface {
  /**
   * 执行写操作（INSERT / UPDATE / DELETE / DDL）
   * @param sql SQL 语句，使用 ? 占位符
   * @param params 参数数组
   * @returns 执行结果
   */
  execute(sql: string, params?: unknown[]): Promise<QueryResult>;

  /**
   * 查询多行
   * @param sql SELECT 语句
   * @param params 参数数组
   * @returns 行数组，每行为 Record<string, unknown>
   */
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>;

  /**
   * 查询单行（无结果返回 undefined）
   */
  queryOne<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | undefined>;

  /**
   * 在事务中执行操作
   * @param fn 事务函数，返回 true 提交，抛出异常或返回 false 回滚
   */
  transaction<T>(fn: () => T): Promise<T>;

  /** 关闭数据库连接 */
  close(): Promise<void> | void;

  /** 数据库适配器名称 */
  readonly adapterName: string;
}
