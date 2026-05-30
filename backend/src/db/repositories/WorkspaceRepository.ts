/**
 * 工作区 Repository
 * 封装 workspaces 表的所有 CRUD 操作
 */

import type { DatabaseInterface } from '../DatabaseInterface.js';
import type { WorkspaceConfig } from '../../types/index.js';

export class WorkspaceRepository {
  private db: DatabaseInterface;

  constructor(db: DatabaseInterface) {
    this.db = db;
  }

  /** 查询所有工作区 */
  async findAll(): Promise<WorkspaceConfig[]> {
    const rows = await this.db.query<{
      id: string;
      name: string;
      path: string;
      created_at: number;
    }>('SELECT id, name, path, created_at FROM workspaces ORDER BY created_at ASC');

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      path: row.path,
      createdAt: row.created_at,
    }));
  }

  /** 按 ID 查询单个工作区 */
  async findById(id: string): Promise<WorkspaceConfig | undefined> {
    const row = await this.db.queryOne<{
      id: string;
      name: string;
      path: string;
      created_at: number;
    }>('SELECT id, name, path, created_at FROM workspaces WHERE id = ?', [id]);

    if (!row) return undefined;

    return {
      id: row.id,
      name: row.name,
      path: row.path,
      createdAt: row.created_at,
    };
  }

  /** 按路径查询工作区（同一路径不应重复添加） */
  async findByPath(filePath: string): Promise<WorkspaceConfig | undefined> {
    const row = await this.db.queryOne<{
      id: string;
      name: string;
      path: string;
      created_at: number;
    }>('SELECT id, name, path, created_at FROM workspaces WHERE path = ?', [filePath]);

    if (!row) return undefined;

    return {
      id: row.id,
      name: row.name,
      path: row.path,
      createdAt: row.created_at,
    };
  }

  /** 创建工作区 */
  async create(workspace: WorkspaceConfig): Promise<WorkspaceConfig> {
    await this.db.execute(
      'INSERT INTO workspaces (id, name, path, created_at) VALUES (?, ?, ?, ?)',
      [workspace.id, workspace.name, workspace.path, workspace.createdAt]
    );
    return { ...workspace };
  }

  /** 删除工作区 */
  async deleteById(id: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM workspaces WHERE id = ?', [id]);
    return result.changes > 0;
  }

  /** 统计工作区数量 */
  async count(): Promise<number> {
    const row = await this.db.queryOne<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM workspaces'
    );
    return row?.cnt ?? 0;
  }
}
