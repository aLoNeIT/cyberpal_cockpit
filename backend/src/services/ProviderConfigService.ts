import type {
  ProvidersConfig,
  ProviderConfig,
  ProviderModel,
  ProviderSummary,
  ProviderDetail,
  ProviderModelRuntimeConfig,
} from '../types/index.js';
import type { ProviderRepository } from '../db/repositories/ProviderRepository.js';

/** 默认提供商配置（apiKey 为空） */
const DEFAULT_CONFIG: ProvidersConfig = {
  providers: {
    deepseek: {
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com',
      apiKey: '',
      visible: true,
      models: [
        { id: 'deepseek-chat', name: 'DeepSeek V3', isDefault: true, visible: true },
        { id: 'deepseek-reasoner', name: 'DeepSeek R1', visible: true },
      ],
    },
    openai: {
      name: 'OpenAI',
      baseUrl: 'https://api.openai.com',
      apiKey: '',
      visible: true,
      models: [
        { id: 'gpt-4o', name: 'GPT-4o', isDefault: true, visible: true },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini', visible: true },
      ],
    },
    alibaba: {
      name: 'Alibaba',
      baseUrl: 'https://dashscope.aliyuncs.com',
      apiKey: '',
      visible: true,
      models: [
        { id: 'qwen-plus', name: 'Qwen Plus', isDefault: true, visible: true },
        { id: 'qwen-max', name: 'Qwen Max', visible: true },
      ],
    },
    anthropic: {
      name: 'Anthropic',
      baseUrl: 'https://api.anthropic.com',
      apiKey: '',
      visible: true,
      models: [
        { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', isDefault: true, visible: true },
        { id: 'claude-3-opus', name: 'Claude 3 Opus', visible: true },
      ],
    },
  },
};

/** 脱敏 API Key：只显示前4位+后4位 */
function maskApiKey(key: string): string {
  if (!key || key.length <= 8) {
    return key ? '*'.repeat(key.length) : '';
  }
  const prefix = key.slice(0, 4);
  const suffix = key.slice(-4);
  const middle = '*'.repeat(Math.min(key.length - 8, 16));
  return `${prefix}${middle}${suffix}`;
}

function isMaskedApiKeyPlaceholder(key: string): boolean {
  return /\*{2,}/.test(key.trim());
}

function hasUsableApiKey(key: string): boolean {
  const trimmed = key.trim();
  return trimmed.length > 0 && !isMaskedApiKeyPlaceholder(trimmed);
}

export class ProviderConfigService {
  private providerRepo: ProviderRepository;
  private configCache: Map<string, ProviderConfig> = new Map();
  private initialized: boolean = false;

  constructor(providerRepo: ProviderRepository) {
    this.providerRepo = providerRepo;
  }

  /** 异步初始化：播种默认配置 + 加载缓存 */
  async init(): Promise<void> {
    await this.seedDefaults();
    await this.loadCache();
    this.initialized = true;
  }

  /** 确保默认配置已写入数据库 */
  private async seedDefaults(): Promise<void> {
    try {
      const defaults = Object.entries(DEFAULT_CONFIG.providers).map(([id, config]) => ({
        id,
        config: { ...config },
      }));
      await this.providerRepo.seedDefaults(defaults);
    } catch {
      // 数据库不可用时使用内存默认
    }
  }

  /** 从数据库加载配置到内存缓存 */
  private async loadCache(): Promise<void> {
    try {
      const all = await this.providerRepo.findAll();
      for (const { id, config } of all) {
        this.configCache.set(id, config);
      }
    } catch {
      // 数据库不可用时使用内存默认
    }

    // 如果数据库为空，写入默认值
    if (this.configCache.size === 0) {
      this.loadDefaultsToCache();
    }
  }

  /** 回退：加载默认配置到内存 */
  private loadDefaultsToCache(): void {
    for (const [id, config] of Object.entries(DEFAULT_CONFIG.providers)) {
      this.configCache.set(id, { ...config });
    }
  }

  /** 获取所有 provider 摘要 */
  getProviderSummaries(): ProviderSummary[] {
    const summaries: ProviderSummary[] = [];
    for (const [id, cfg] of this.configCache) {
      summaries.push({
        id,
        name: cfg.name,
        configured: hasUsableApiKey(cfg.apiKey),
        modelCount: cfg.models.length,
        visible: cfg.visible !== false,
      });
    }
    return summaries;
  }

  /** 获取单个 provider 详情（脱敏） */
  getProviderDetail(id: string): ProviderDetail | null {
    const cfg = this.configCache.get(id);
    if (!cfg) return null;
    return {
      id,
      name: cfg.name,
      baseUrl: cfg.baseUrl,
      apiKey: maskApiKey(cfg.apiKey),
      visible: cfg.visible !== false,
      models: cfg.models.map((m) => ({ ...m })),
    };
  }

  /** 获取合并后的模型列表 */
  getMergedModels(): Array<{
    id: string;
    name: string;
    provider: string;
    isDefault: boolean;
    providerId: string;
    modelId: string;
    selector: string;
    visible: boolean;
  }> {
    const models: Array<{
      id: string;
      name: string;
      provider: string;
      isDefault: boolean;
      providerId: string;
      modelId: string;
      selector: string;
      visible: boolean;
    }> = [];
    for (const [providerId, cfg] of this.configCache) {
      if (cfg.visible === false) {
        continue;
      }
      for (const m of cfg.models) {
        const visible = m.visible ?? true;
        models.push({
          id: m.id,
          name: m.name,
          provider: cfg.name,
          isDefault: m.isDefault ?? false,
          providerId,
          modelId: m.id,
          selector: `${providerId}/${m.id}`,
          visible,
        });
      }
    }
    return models;
  }

  getModelRuntimeConfig(modelSelector: string): ProviderModelRuntimeConfig | null {
    const selector = modelSelector.trim();
    if (!selector) return null;

    const explicitSeparator = selector.indexOf('/');
    const explicitProviderId = explicitSeparator > 0 ? selector.slice(0, explicitSeparator) : null;
    const modelId = explicitSeparator > 0 ? selector.slice(explicitSeparator + 1) : selector;
    if (!modelId) return null;

    for (const [providerId, cfg] of this.configCache) {
      if (explicitProviderId && providerId.toLowerCase() !== explicitProviderId.toLowerCase()) {
        continue;
      }
      if (cfg.visible === false) {
        continue;
      }

      const model = cfg.models.find((m) => m.id.toLowerCase() === modelId.toLowerCase());
      if (!model || model.visible === false || !hasUsableApiKey(cfg.apiKey) || !cfg.baseUrl.trim()) {
        continue;
      }

      return {
        providerId,
        providerName: cfg.name,
        baseUrl: cfg.baseUrl,
        apiKey: cfg.apiKey,
        model: { ...model },
      };
    }

    return null;
  }

  /** 添加新 provider */
  async addProvider(id: string, name: string, baseUrl: string): Promise<ProviderConfig> {
    if (this.configCache.has(id)) {
      throw new Error(`Provider "${id}" already exists`);
    }
    const cfg: ProviderConfig = {
      name,
      baseUrl,
      apiKey: '',
      visible: true,
      models: [],
    };

    try {
      await this.providerRepo.insert(id, cfg);
    } catch {
      // 数据库不可用时仅存内存
    }

    this.configCache.set(id, cfg);
    return { ...cfg };
  }

  /** 删除 provider */
  async deleteProvider(id: string): Promise<boolean> {
    if (!this.configCache.has(id)) return false;

    try {
      await this.providerRepo.deleteById(id);
    } catch {
      // 忽略
    }

    this.configCache.delete(id);
    return true;
  }

  /** 更新 provider 配置 */
  async updateProvider(id: string, updates: { name?: string; baseUrl?: string; apiKey?: string; visible?: boolean; models?: ProviderModel[] }): Promise<ProviderConfig | null> {
    const cfg = this.configCache.get(id);
    if (!cfg) return null;

    const repoUpdates = { ...updates };

    if (updates.name !== undefined) cfg.name = updates.name;
    if (updates.baseUrl !== undefined) cfg.baseUrl = updates.baseUrl;
    if (updates.visible !== undefined) cfg.visible = updates.visible;
    if (updates.apiKey !== undefined) {
      if (isMaskedApiKeyPlaceholder(updates.apiKey)) {
        delete repoUpdates.apiKey;
      } else {
        cfg.apiKey = updates.apiKey;
      }
    }
    if (updates.models !== undefined) cfg.models = updates.models;

    try {
      await this.providerRepo.update(id, repoUpdates);
    } catch {
      // 忽略
    }

    this.configCache.set(id, cfg);
    return { ...cfg };
  }

  /** 仅更新 API Key */
  async updateApiKey(id: string, apiKey: string): Promise<ProviderConfig | null> {
    const cfg = this.configCache.get(id);
    if (!cfg) return null;

    cfg.apiKey = apiKey;

    try {
      await this.providerRepo.updateApiKey(id, apiKey);
    } catch {
      // 忽略
    }

    this.configCache.set(id, cfg);
    return { ...cfg };
  }
}
