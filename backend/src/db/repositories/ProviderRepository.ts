/**
 * Provider Repository
 * 封装 provider_configs 表的所有 CRUD 操作。
 * 替代原先 ProviderConfigService 中的 JSON 文件读写。
 */

import type { DatabaseInterface } from '../DatabaseInterface.js';
import type { ProviderConfig, ProviderModel } from '../../types/index.js';

interface ProviderRow {
  id: string;
  name: string;
  base_url: string;
  api_key: string;
  models: string; // JSON string
  created_at: number;
  updated_at: number;
}

export class ProviderRepository {
  private db: DatabaseInterface;

  constructor(db: DatabaseInterface) {
    this.db = db;
  }

  /** 查询所有 provider */
  async findAll(): Promise<Array<{ id: string; config: ProviderConfig }>> {
    const rows = await this.db.query<ProviderRow>(
      'SELECT * FROM provider_configs ORDER BY id'
    );

    return rows.map((row) => ({
      id: row.id,
      config: this.rowToConfig(row),
    }));
  }

  /** 按 ID 查询 */
  async findById(id: string): Promise<ProviderConfig | undefined> {
    const row = await this.db.queryOne<ProviderRow>(
      'SELECT * FROM provider_configs WHERE id = ?',
      [id]
    );
    if (!row) return undefined;
    return this.rowToConfig(row);
  }

  /** 插入 provider 配置 */
  async insert(id: string, config: ProviderConfig): Promise<void> {
    const modelsJson = JSON.stringify(config.models);
    const now = Date.now();
    await this.db.execute(
      `INSERT INTO provider_configs (id, name, base_url, api_key, models, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, config.name, config.baseUrl, config.apiKey, modelsJson, now, now]
    );
  }

  /** 更新 provider 配置 */
  async update(id: string, partial: {
    name?: string;
    baseUrl?: string;
    apiKey?: string;
    models?: ProviderModel[];
  }): Promise<boolean> {
    const existing = await this.db.queryOne<ProviderRow>(
      'SELECT * FROM provider_configs WHERE id = ?',
      [id]
    );
    if (!existing) return false;

    const name = partial.name ?? existing.name;
    const baseUrl = partial.baseUrl ?? existing.base_url;
    const apiKey = partial.apiKey !== undefined ? partial.apiKey : existing.api_key;
    const modelsJson = partial.models !== undefined
      ? JSON.stringify(partial.models)
      : existing.models;

    await this.db.execute(
      `UPDATE provider_configs
       SET name = ?, base_url = ?, api_key = ?, models = ?, updated_at = ?
       WHERE id = ?`,
      [name, baseUrl, apiKey, modelsJson, Date.now(), id]
    );
    return true;
  }

  /** 仅更新 API Key */
  async updateApiKey(id: string, apiKey: string): Promise<boolean> {
    const result = await this.db.execute(
      'UPDATE provider_configs SET api_key = ?, updated_at = ? WHERE id = ?',
      [apiKey, Date.now(), id]
    );
    return result.changes > 0;
  }

  /** 删除 provider */
  async deleteById(id: string): Promise<boolean> {
    const result = await this.db.execute('DELETE FROM provider_configs WHERE id = ?', [id]);
    return result.changes > 0;
  }

  /** 统计数量 */
  async count(): Promise<number> {
    const row = await this.db.queryOne<{ cnt: number }>(
      'SELECT COUNT(*) as cnt FROM provider_configs'
    );
    return row?.cnt ?? 0;
  }

  /** 是否存在 */
  async exists(id: string): Promise<boolean> {
    const row = await this.db.queryOne<{ cnt: number }>(
      'SELECT 1 as cnt FROM provider_configs WHERE id = ?',
      [id]
    );
    return row !== undefined;
  }

  /** 批量初始化默认配置（仅当表为空时） */
  async seedDefaults(defaults: Array<{ id: string; config: ProviderConfig }>): Promise<void> {
    const cnt = await this.count();
    if (cnt > 0) return;

    for (const { id, config } of defaults) {
      await this.insert(id, config);
    }
  }

  /** 行转 ProviderConfig */
  private rowToConfig(row: ProviderRow): ProviderConfig {
    let models: ProviderModel[] = [];
    try {
      models = JSON.parse(row.models) as ProviderModel[];
    } catch {
      models = [];
    }

    return {
      name: row.name,
      baseUrl: row.base_url,
      apiKey: row.api_key,
      models,
    };
  }
}
