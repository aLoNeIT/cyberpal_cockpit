<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import type { ProviderSummary, ProviderDetail, ProviderModel } from '@/types';
import * as api from '@/services/api';

const BUILTINS = ['deepseek', 'openai', 'alibaba', 'anthropic'];

// Provider 列表
const providers = ref<ProviderSummary[]>([]);
const selectedId = ref<string | null>(null);
const loading = ref(false);
const saving = ref(false);
const errorMsg = ref('');
const successMsg = ref('');

// 编辑表单
const editName = ref('');
const editBaseUrl = ref('');
const editApiKey = ref('');
const showApiKey = ref(false);
const editModels = ref<ProviderModel[]>([]);
const newModelId = ref('');
const newModelName = ref('');

// 原值（用于重置）
const originalName = ref('');
const originalBaseUrl = ref('');
const originalApiKey = ref('');
const originalModels = ref<ProviderModel[]>([]);

// ====== 添加 Provider 表单 ======
const showAddForm = ref(false);
const addId = ref('');
const addName = ref('');
const addBaseUrl = ref('');
const addError = ref('');

const selectedSummary = computed(() =>
  providers.value.find((p) => p.id === selectedId.value)
);

const isBuiltin = computed(() =>
  selectedId.value ? BUILTINS.includes(selectedId.value) : false
);

// 自定义图标映射
function providerIcon(id: string): string {
  const icons: Record<string, string> = {
    deepseek: '🟢', openai: '⚫', alibaba: '🟠', anthropic: '🟣',
  };
  return icons[id] || '🔧';
}

async function loadProviders(): Promise<void> {
  try {
    providers.value = await api.fetchProviders();
    if (!selectedId.value && providers.value.length > 0) {
      selectedId.value = providers.value[0].id;
      await loadDetail(selectedId.value);
    }
  } catch (err) {
    errorMsg.value = '加载提供商列表失败';
  }
}

async function loadDetail(id: string): Promise<void> {
  loading.value = true;
  errorMsg.value = '';
  successMsg.value = '';
  try {
    const detail: ProviderDetail = await api.fetchProviderDetail(id);
    editName.value = detail.name;
    editBaseUrl.value = detail.baseUrl;
    editApiKey.value = detail.apiKey;
    editModels.value = detail.models.map((m) => ({ ...m }));
    originalName.value = detail.name;
    originalBaseUrl.value = detail.baseUrl;
    originalApiKey.value = detail.apiKey;
    originalModels.value = detail.models.map((m) => ({ ...m }));
  } catch (err) {
    errorMsg.value = '加载提供商详情失败';
  } finally {
    loading.value = false;
  }
}

function selectProvider(id: string): void {
  if (id === selectedId.value) return;
  selectedId.value = id;
  loadDetail(id);
}

async function handleSave(): Promise<void> {
  if (!selectedId.value) return;
  saving.value = true;
  errorMsg.value = '';
  successMsg.value = '';
  try {
    const payload: { name: string; baseUrl: string; apiKey?: string; models: ProviderModel[] } = {
      name: editName.value,
      baseUrl: editBaseUrl.value,
      models: editModels.value,
    };

    if (editApiKey.value !== originalApiKey.value && !editApiKey.value.includes('**')) {
      payload.apiKey = editApiKey.value;
    }

    const detail = await api.updateProvider(selectedId.value, payload);
    editName.value = detail.name;
    editBaseUrl.value = detail.baseUrl;
    editApiKey.value = detail.apiKey;
    editModels.value = detail.models.map((m) => ({ ...m }));
    originalName.value = detail.name;
    originalBaseUrl.value = detail.baseUrl;
    originalApiKey.value = detail.apiKey;
    originalModels.value = detail.models.map((m) => ({ ...m }));
    await loadProviders();
    successMsg.value = '保存成功';
    setTimeout(() => { successMsg.value = ''; }, 2000);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '保存失败';
    errorMsg.value = msg;
  } finally {
    saving.value = false;
  }
}

function handleReset(): void {
  editName.value = originalName.value;
  editBaseUrl.value = originalBaseUrl.value;
  editApiKey.value = originalApiKey.value;
  editModels.value = originalModels.value.map((m) => ({ ...m }));
  showApiKey.value = false;
  errorMsg.value = '';
  successMsg.value = '';
}

// ====== 添加 Provider ======
async function handleAddProvider(): Promise<void> {
  const id = addId.value.trim();
  const name = addName.value.trim();
  const baseUrl = addBaseUrl.value.trim();
  if (!id || !name || !baseUrl) {
    addError.value = '所有字段均不能为空';
    return;
  }
  try {
    await api.createProvider(id, name, baseUrl);
    showAddForm.value = false;
    addId.value = '';
    addName.value = '';
    addBaseUrl.value = '';
    addError.value = '';
    await loadProviders();
    selectedId.value = id;
    loadDetail(id);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '创建提供商失败';
    addError.value = msg;
  }
}

// ====== 删除 Provider ======
async function handleDelete(): Promise<void> {
  if (!selectedId.value) return;
  if (isBuiltin.value) return;
  if (!confirm(`确定要删除提供商"${selectedSummary.value?.name}"？此操作不可撤销。`)) return;
  try {
    await api.deleteProvider(selectedId.value);
    selectedId.value = null;
    await loadProviders();
    successMsg.value = '提供商已删除';
    setTimeout(() => { successMsg.value = ''; }, 2000);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '删除失败';
    errorMsg.value = msg;
  }
}

function addModel(): void {
  const id = newModelId.value.trim();
  const name = newModelName.value.trim();
  if (!id || !name) return;
  if (editModels.value.some((m) => m.id === id)) {
    errorMsg.value = `模型 ID "${id}" 已存在`;
    return;
  }
  editModels.value.push({ id, name });
  newModelId.value = '';
  newModelName.value = '';
  errorMsg.value = '';
}

function removeModel(index: number): void {
  editModels.value.splice(index, 1);
}

function setDefaultModel(modelId: string): void {
  for (const m of editModels.value) {
    m.isDefault = m.id === modelId;
  }
}

onMounted(() => {
  loadProviders();
});
</script>

<template>
  <div class="flex gap-6 h-full">
    <!-- Provider 列表 -->
    <div class="w-56 flex-shrink-0 space-y-1">
      <div class="flex items-center justify-between mb-2">
        <span class="type-label text-cockpit-muted">提供商</span>
        <button
          class="text-xs px-2 py-0.5 rounded bg-cockpit-accent/10 text-cockpit-accent hover:bg-cockpit-accent/20 transition-colors"
          @click="showAddForm = !showAddForm"
        >
          + 添加
        </button>
      </div>

      <!-- 添加表单 -->
      <div v-if="showAddForm" class="bg-cockpit-bg border border-cockpit-accent/30 rounded-lg p-2 mb-2 space-y-1.5">
        <input
          v-model="addId"
          type="text"
          placeholder="Provider ID（例如：groq）"
          class="w-full bg-cockpit-surface border border-cockpit-border rounded px-2 py-1 text-xs text-cockpit-text placeholder-cockpit-muted focus:outline-none focus:border-cockpit-accent"
        />
        <input
          v-model="addName"
          type="text"
          placeholder="显示名称（例如：Groq）"
          class="w-full bg-cockpit-surface border border-cockpit-border rounded px-2 py-1 text-xs text-cockpit-text placeholder-cockpit-muted focus:outline-none focus:border-cockpit-accent"
        />
        <input
          v-model="addBaseUrl"
          type="text"
          placeholder="Base URL（例如：https://api.groq.com）"
          class="w-full bg-cockpit-surface border border-cockpit-border rounded px-2 py-1 text-xs text-cockpit-text placeholder-cockpit-muted focus:outline-none focus:border-cockpit-accent"
          @keydown.enter="handleAddProvider"
        />
        <p v-if="addError" class="text-2xs text-cockpit-danger">{{ addError }}</p>
        <div class="flex gap-1">
          <button
            class="flex-1 px-2 py-1 text-xs font-medium rounded-sm bg-cockpit-accent text-white hover:bg-cockpit-accent-hover transition-colors duration-150"
            @click="handleAddProvider"
          >
            Add
          </button>
          <button
            class="px-2 py-1 text-xs rounded text-cockpit-muted hover:text-cockpit-text transition-colors"
            @click="showAddForm = false; addError = ''"
          >
            取消
          </button>
        </div>
      </div>

      <button
        v-for="p in providers"
        :key="p.id"
        class="w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center justify-between transition-colors group"
        :class="selectedId === p.id
          ? 'bg-cockpit-accent/15 text-cockpit-accent border border-cockpit-accent/30'
          : 'text-cockpit-text hover:bg-cockpit-border/30 border border-transparent'"
        @click="selectProvider(p.id)"
      >
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-base flex-shrink-0">{{ providerIcon(p.id) }}</span>
          <div class="min-w-0">
            <div class="text-xs font-medium truncate">{{ p.name }}</div>
            <div class="text-2xs" :class="p.configured ? 'text-cockpit-success' : 'text-cockpit-muted'">
              {{ p.configured ? '已配置' : '未配置' }}
            </div>
          </div>
        </div>
        <span class="text-2xs text-cockpit-muted flex-shrink-0 ml-1">{{ p.modelCount }}</span>
      </button>
    </div>

    <!-- 编辑区 -->
    <div class="flex-1 min-w-0">
      <div v-if="!selectedId" class="flex items-center justify-center h-full text-cockpit-muted text-sm">
        从列表中选择一个提供商
      </div>

      <div v-else-if="loading" class="flex items-center justify-center h-full text-cockpit-muted text-sm">
        正在加载...
      </div>

      <div v-else class="space-y-4">
        <!-- Provider 名称 -->
        <div>
          <label class="block text-xs text-cockpit-muted mb-1">名称</label>
          <input
            v-model="editName"
            type="text"
            class="w-full bg-cockpit-bg border border-cockpit-border rounded px-3 py-1.5 text-sm text-cockpit-text placeholder-cockpit-muted focus:outline-none focus:border-cockpit-accent"
          />
        </div>

        <!-- Provider ID (只读) -->
        <div>
          <label class="block text-xs text-cockpit-muted mb-1">ID</label>
          <input
            type="text"
            readonly
            :value="selectedId"
            class="w-full bg-cockpit-bg border border-cockpit-border rounded px-3 py-1.5 text-sm text-cockpit-text cursor-not-allowed opacity-60 font-mono"
          />
        </div>

        <!-- API Base URL -->
        <div>
          <label class="block text-xs text-cockpit-muted mb-1">API 基础地址</label>
          <input
            v-model="editBaseUrl"
            type="text"
            class="w-full bg-cockpit-bg border border-cockpit-border rounded px-3 py-1.5 text-sm text-cockpit-text placeholder-cockpit-muted focus:outline-none focus:border-cockpit-accent"
            placeholder="https://api.example.com"
          />
        </div>

        <!-- API Key -->
        <div>
          <label class="block text-xs text-cockpit-muted mb-1">API 密钥</label>
          <div class="flex gap-1">
            <input
              v-model="editApiKey"
              :type="showApiKey ? 'text' : 'password'"
              class="flex-1 bg-cockpit-bg border border-cockpit-border rounded px-3 py-1.5 text-sm text-cockpit-text placeholder-cockpit-muted focus:outline-none focus:border-cockpit-accent font-mono"
              placeholder="输入 API Key"
            />
            <button
              class="px-2 py-1.5 text-xs rounded text-cockpit-muted hover:text-cockpit-text hover:bg-cockpit-border/30 transition-colors"
              @click="showApiKey = !showApiKey"
              :title="showApiKey ? '隐藏 API Key' : '显示 API Key'"
            >
              {{ showApiKey ? '🙈' : '👁' }}
            </button>
          </div>
        </div>

        <!-- 默认模型 -->
        <div>
          <label class="block text-xs text-cockpit-muted mb-1">默认模型</label>
          <select
            class="w-full bg-cockpit-bg border border-cockpit-border rounded px-3 py-1.5 text-sm text-cockpit-text focus:outline-none focus:border-cockpit-accent"
            @change="(e: Event) => setDefaultModel((e.target as HTMLSelectElement).value)"
          >
            <option value="" disabled>选择默认模型</option>
            <option
              v-for="m in editModels"
              :key="m.id"
              :value="m.id"
              :selected="m.isDefault"
            >
              {{ m.name }} ({{ m.id }})
            </option>
          </select>
        </div>

        <!-- 模型列表 -->
        <div>
          <div class="flex items-center justify-between mb-1">
            <label class="text-xs text-cockpit-muted">模型列表</label>
            <span class="text-2xs text-cockpit-muted">{{ editModels.length }} 个模型</span>
          </div>

          <div class="space-y-1 mb-2 max-h-40 overflow-y-auto">
            <div
              v-for="(m, idx) in editModels"
              :key="m.id"
              class="flex items-center justify-between bg-cockpit-bg border border-cockpit-border rounded px-3 py-1.5 group"
            >
              <div class="flex items-center gap-2 min-w-0">
                <span class="text-xs text-cockpit-text font-mono truncate">{{ m.id }}</span>
                <span class="text-2xs text-cockpit-muted truncate">{{ m.name }}</span>
                <span
                  v-if="m.isDefault"
                  class="text-2xs text-cockpit-accent bg-cockpit-accent/10 px-1 rounded"
                >
                  默认
                </span>
              </div>
              <button
                class="text-cockpit-muted hover:text-cockpit-danger opacity-0 group-hover:opacity-100 transition-opacity text-xs flex-shrink-0 ml-2"
                @click="removeModel(idx)"
                title="移除模型"
              >
                ✕
              </button>
            </div>
          </div>

          <!-- 添加模型 -->
          <div class="flex gap-1">
            <input
              v-model="newModelId"
              type="text"
              placeholder="模型 ID"
              class="flex-1 bg-cockpit-bg border border-cockpit-border rounded px-2 py-1 text-xs text-cockpit-text placeholder-cockpit-muted focus:outline-none focus:border-cockpit-accent font-mono"
              @keydown.enter="addModel"
            />
            <input
              v-model="newModelName"
              type="text"
              placeholder="模型名称"
              class="flex-1 bg-cockpit-bg border border-cockpit-border rounded px-2 py-1 text-xs text-cockpit-text placeholder-cockpit-muted focus:outline-none focus:border-cockpit-accent"
              @keydown.enter="addModel"
            />
            <button
              class="px-3 py-1 text-xs rounded bg-cockpit-accent/10 text-cockpit-accent hover:bg-cockpit-accent/20 transition-colors disabled:opacity-30"
              :disabled="!newModelId.trim() || !newModelName.trim()"
              @click="addModel"
            >
              + Add
            </button>
          </div>
        </div>

        <!-- 消息 -->
        <p v-if="errorMsg" class="text-xs text-cockpit-danger">{{ errorMsg }}</p>
        <p v-if="successMsg" class="text-xs text-cockpit-success">{{ successMsg }}</p>

        <!-- 操作按钮 -->
        <div class="flex gap-2 pt-2 border-t border-cockpit-border">
          <button
            class="px-4 py-1.5 text-xs font-medium rounded-sm bg-cockpit-accent text-white hover:bg-cockpit-accent-hover transition-colors duration-150 disabled:opacity-50"
            :disabled="saving"
            @click="handleSave"
          >
            {{ saving ? '保存中...' : '保存' }}
          </button>
          <button
            class="px-4 py-1.5 text-xs rounded bg-cockpit-border/30 text-cockpit-text hover:bg-cockpit-border/50 transition-colors"
            @click="handleReset"
          >
            重置
          </button>
          <div class="flex-1"></div>
          <button
            v-if="!isBuiltin"
            class="px-4 py-1.5 text-xs rounded bg-cockpit-danger/10 text-cockpit-danger hover:bg-cockpit-danger/20 transition-colors"
            @click="handleDelete"
          >
            删除
          </button>
          <span
            v-else
            class="px-4 py-1.5 text-xs text-cockpit-muted cursor-not-allowed"
            title="内置提供商不可删除"
          >
            内置
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>
