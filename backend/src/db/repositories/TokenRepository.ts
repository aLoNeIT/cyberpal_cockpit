/**
 * Token Repository
 * 封装 token_records 表的所有 CRUD 操作。
 * 替代原先 TokenTracker 中的 JSON 文件读写。
 */

import type { DatabaseInterface } from '../DatabaseInterface.js';
import type { DailyTokenRecord } from '../../types/index.js';

export interface TokenRecordRow {
  id: number;
  date: string;
  agent_id: string;
  workspace_id: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  cumulative_tokens: number;
  cost_usd: number;
  created_at: number;
}

export class TokenRepository {
  private db: DatabaseInterface;

  constructor(db: DatabaseInterface) {
    this.db = db;
  }

  /** 插入单条 token 记录 */
  async insert(record: {
    date: string;
    agentId: string;
    workspaceId: string | null;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    cumulativeTokens: number;
    costUsd?: number;
  }): Promise<void> {
    await this.db.execute(
      `INSERT INTO token_records (date, agent_id, workspace_id, model, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cumulative_tokens, cost_usd, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.date,
        record.agentId,
        record.workspaceId,
        record.model,
        record.inputTokens,
        record.outputTokens,
        record.cacheReadTokens ?? 0,
        record.cacheWriteTokens ?? 0,
        record.cumulativeTokens,
        record.costUsd ?? 0,
        Date.now(),
      ]
    );
  }

  /**
   * UPSERT：合并今日同一 agent 的记录。
   * 如果今天该 agent 已有记录，则累加；否则插入新行。
   */
  async upsertDaily(record: {
    date: string;
    agentId: string;
    workspaceId: string | null;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    cumulativeTokens: number;
    costUsd?: number;
  }): Promise<void> {
    const existing = await this.db.queryOne<TokenRecordRow>(
      'SELECT id, input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cumulative_tokens, cost_usd FROM token_records WHERE date = ? AND agent_id = ?',
      [record.date, record.agentId]
    );

    if (existing) {
      await this.db.execute(
        `UPDATE token_records
         SET input_tokens = input_tokens + ?,
             output_tokens = output_tokens + ?,
             cache_read_tokens = cache_read_tokens + ?,
             cache_write_tokens = cache_write_tokens + ?,
             cumulative_tokens = cumulative_tokens + ?,
             cost_usd = cost_usd + ?,
             model = ?
         WHERE id = ?`,
        [
          record.inputTokens,
          record.outputTokens,
          record.cacheReadTokens ?? 0,
          record.cacheWriteTokens ?? 0,
          record.cumulativeTokens,
          record.costUsd ?? 0,
          record.model,
          existing.id,
        ]
      );
    } else {
      await this.insert(record);
    }
  }

  /** 查询记录（支持多条件筛选） */
  async query(params: {
    startDate?: string;
    endDate?: string;
    agentId?: string;
    workspaceId?: string;
  }): Promise<DailyTokenRecord[]> {
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (params.startDate) {
      conditions.push('date >= ?');
      values.push(params.startDate);
    }
    if (params.endDate) {
      conditions.push('date <= ?');
      values.push(params.endDate);
    }
    if (params.agentId) {
      conditions.push('agent_id = ?');
      values.push(params.agentId);
    }
    if (params.workspaceId) {
      conditions.push('workspace_id = ?');
      values.push(params.workspaceId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const sql = `SELECT * FROM token_records ${whereClause} ORDER BY date DESC, agent_id`;

    const rows = await this.db.query<TokenRecordRow>(sql, values);

    return rows.map((row) => ({
      date: row.date,
      agentId: row.agent_id,
      workspaceId: row.workspace_id,
      model: row.model,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cacheReadTokens: row.cache_read_tokens ?? 0,
      cacheWriteTokens: row.cache_write_tokens ?? 0,
      cumulativeTokens: row.cumulative_tokens,
      costUsd: row.cost_usd ?? 0,
    }));
  }

  /** 获取某月所有记录 */
  async getByMonth(month: string): Promise<DailyTokenRecord[]> {
    const rows = await this.db.query<TokenRecordRow>(
      "SELECT * FROM token_records WHERE date LIKE ? ORDER BY date",
      [`${month}%`]
    );

    return rows.map((row) => ({
      date: row.date,
      agentId: row.agent_id,
      workspaceId: row.workspace_id,
      model: row.model,
      inputTokens: row.input_tokens,
      outputTokens: row.output_tokens,
      cacheReadTokens: row.cache_read_tokens ?? 0,
      cacheWriteTokens: row.cache_write_tokens ?? 0,
      cumulativeTokens: row.cumulative_tokens,
      costUsd: row.cost_usd ?? 0,
    }));
  }

  /** 删除某月的记录 */
  async deleteByMonth(month: string): Promise<number> {
    const result = await this.db.execute(
      "DELETE FROM token_records WHERE date LIKE ?",
      [`${month}%`]
    );
    return result.changes;
  }

  /** 获取某 agent 的累计 token */
  async getAgentTotal(agentId: string): Promise<number> {
    const row = await this.db.queryOne<{ total: number }>(
      'SELECT COALESCE(SUM(cumulative_tokens), 0) as total FROM token_records WHERE agent_id = ?',
      [agentId]
    );
    return row?.total ?? 0;
  }

  /** 获取全部 token 总量 */
  async getTotalUsage(): Promise<number> {
    const row = await this.db.queryOne<{ total: number }>(
      'SELECT COALESCE(SUM(cumulative_tokens), 0) as total FROM token_records'
    );
    return row?.total ?? 0;
  }

  /** 批量插入 */
  async bulkInsert(records: Array<{
    date: string;
    agentId: string;
    workspaceId: string | null;
    model: string;
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
    cumulativeTokens: number;
    costUsd?: number;
  }>): Promise<void> {
    for (const record of records) {
      await this.insert(record);
    }
  }
}
