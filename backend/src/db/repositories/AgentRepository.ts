/**
 * Agent Repository
 * 封装 agents 表的历史记录 / 审计日志操作。
 *
 * 注意：运行时 agent 状态由 AgentManager 在内存中管理。
 * 此 repository 用于持久化 agent 创建/停止事件，供重启后查询历史。
 */

import type { DatabaseInterface } from '../DatabaseInterface.js';
import type { AgentInfo } from '../../types/index.js';

export interface AgentRecord {
  id: string;
  cwd: string;
  status: string;
  pid: number | null;
  workspace_id: string | null;
  parent_id: string | null;
  task_description: string | null;
  model: string | null;
  session_file: string | null;
  session_id: string | null;
  created_at: number;
}

export class AgentRepository {
  private db: DatabaseInterface;

  constructor(db: DatabaseInterface) {
    this.db = db;
  }

  /** 按 ID 查询 */
  async findById(id: string): Promise<AgentRecord | undefined> {
    return this.db.queryOne<AgentRecord>(
      'SELECT * FROM agents WHERE id = ?',
      [id]
    );
  }

  /** 按工作区查询 */
  async findByWorkspace(workspaceId: string): Promise<AgentRecord[]> {
    return this.db.query<AgentRecord>(
      'SELECT * FROM agents WHERE workspace_id = ? ORDER BY created_at DESC',
      [workspaceId]
    );
  }

  /** 按父 agent 查询子 agent */
  async findByParent(parentId: string): Promise<AgentRecord[]> {
    return this.db.query<AgentRecord>(
      'SELECT * FROM agents WHERE parent_id = ? ORDER BY created_at ASC',
      [parentId]
    );
  }

  /** 查询最近 N 条记录 */
  async findRecent(limit: number = 50): Promise<AgentRecord[]> {
    return this.db.query<AgentRecord>(
      'SELECT * FROM agents ORDER BY created_at DESC LIMIT ?',
      [limit]
    );
  }

  async findRecentAgentInfo(limit: number = 50): Promise<AgentInfo[]> {
    const rows = await this.findRecent(limit);
    const childRows = await this.db.query<{ parent_id: string; id: string }>(
      'SELECT parent_id, id FROM agents WHERE parent_id IS NOT NULL'
    );
    const childMap = new Map<string, string[]>();
    for (const row of childRows) {
      const current = childMap.get(row.parent_id) || [];
      current.push(row.id);
      childMap.set(row.parent_id, current);
    }

    return rows.map((row) => ({
      id: row.id,
      cwd: row.cwd,
      status: row.status === 'running' ? 'stopped' : row.status as AgentInfo['status'],
      pid: null,
      workspaceId: row.workspace_id,
      createdAt: row.created_at,
      parentId: row.parent_id,
      childIds: childMap.get(row.id) || [],
      taskDescription: row.task_description ?? undefined,
      isOrphaned: false,
      model: row.model ?? undefined,
      sessionFile: row.session_file ?? undefined,
      sessionId: row.session_id ?? undefined,
    }));
  }

  /** 插入 agent 记录 */
  async insert(agent: AgentInfo): Promise<void> {
    const existing = await this.findById(agent.id);
    if (existing) {
      await this.db.execute(
        `UPDATE agents SET
           cwd = ?,
           status = ?,
           pid = ?,
           workspace_id = ?,
           parent_id = ?,
           task_description = ?,
           model = ?,
           session_file = ?,
           session_id = ?
         WHERE id = ?`,
        [
          agent.cwd,
          agent.status,
          agent.pid,
          agent.workspaceId,
          agent.parentId,
          agent.taskDescription ?? null,
          agent.model ?? null,
          agent.sessionFile ?? null,
          agent.sessionId ?? null,
          agent.id,
        ]
      );
      return;
    }

    await this.db.execute(
      `INSERT INTO agents (id, cwd, status, pid, workspace_id, parent_id, task_description, model, session_file, session_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agent.id,
        agent.cwd,
        agent.status,
        agent.pid,
        agent.workspaceId,
        agent.parentId,
        agent.taskDescription ?? null,
        agent.model ?? null,
        agent.sessionFile ?? null,
        agent.sessionId ?? null,
        agent.createdAt,
      ]
    );
  }

  async updateSession(id: string, sessionFile?: string, sessionId?: string): Promise<void> {
    await this.db.execute(
      'UPDATE agents SET session_file = ?, session_id = ? WHERE id = ?',
      [sessionFile ?? null, sessionId ?? null, id],
    );
  }

  /** 更新 agent 状态 */
  async updateStatus(id: string, status: string, pid?: number | null): Promise<void> {
    if (pid !== undefined) {
      await this.db.execute(
        'UPDATE agents SET status = ?, pid = ? WHERE id = ?',
        [status, pid, id]
      );
    } else {
      await this.db.execute(
        'UPDATE agents SET status = ? WHERE id = ?',
        [status, id]
      );
    }
  }

  /** 标记 agent 为孤儿 */
  async markOrphaned(id: string): Promise<void> {
    await this.db.execute(
      "UPDATE agents SET parent_id = NULL, status = status || ' (orphaned)' WHERE id = ?",
      [id]
    );
  }

  /** 删除 agent 记录 */
  async deleteById(id: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM agents WHERE id = ?', [id]);
    return result.changes > 0;
  }

  /** 统计 agent 数量（按状态） */
  async countByStatus(status: string): Promise<number> {
    const row = await this.db.queryOne<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM agents WHERE status = ?',
      [status]
    );
    return row?.cnt ?? 0;
  }
}
