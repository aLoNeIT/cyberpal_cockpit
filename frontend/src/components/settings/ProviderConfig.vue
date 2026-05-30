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
    }
  } catch (err) {
    errorMsg.value = 'Failed to load providers';
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
    errorMsg.value = 'Failed to load provider detail';
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
    await api.updateProvider(selectedId.value, {
      name: editName.value,
      baseUrl: editBaseUrl.value,
      apiKey: editApiKey.value,
      models: editModels.value,
    });
    originalName.value = editName.value;
    originalBaseUrl.value = editBaseUrl.value;
    originalApiKey.value = editApiKey.value;
    originalModels.value = editModels.value.map((m) => ({ ...m }));
    await loadProviders();
    successMsg.value = 'Saved successfully';
    setTimeout(() => { successMsg.value = ''; }, 2000);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Save failed';
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
    addError.value = 'All fields are required';
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
    const msg = err instanceof Error ? err.message : 'Failed to create provider';
    addError.value = msg;
  }
}

// ====== 删除 Provider ======
async function handleDelete(): Promise<void> {
  if (!selectedId.value) return;
  if (isBuiltin.value) return;
  if (!confirm(`Delete provider "${selectedSummary.value?.name}"? This cannot be undone.`)) return;
  try {
    await api.deleteProvider(selectedId.value);
    selectedId.value = null;
    await loadProviders();
    successMsg.value = 'Provider deleted';
    setTimeout(() => { successMsg.value = ''; }, 2000);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Delete failed';
    errorMsg.value = msg;
  }
}

function addModel(): void {
  const id = newModelId.value.trim();
  const name = newModelName.value.trim();
  if (!id || !name) return;
  if (editModels.value.some((m) => m.id === id)) {
    errorMsg.value = `Model ID "${id}" already exists`;
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
        <span class="type-label text-cockpit-muted">Providers</span>
        <button
          class="text-xs px-2 py-0.5 rounded bg-cockpit-accent/10 text-cockpit-accent hover:bg-cockpit-accent/20 transition-colors"
          @click="showAddForm = !showAddForm"
        >
          + Add
        </button>
      </div>

      <!-- 添加表单 -->
      <div v-if="showAddForm" class="bg-cockpit-bg border border-cockpit-accent/30 rounded-lg p-2 mb-2 space-y-1.5">
        <input
          v-model="addId"
          type="text"
          placeholder="Provider ID (e.g., groq)"
          class="w-full bg-cockpit-surface border border-cockpit-border rounded px-2 py-1 text-xs text-cockpit-text placeholder-cockpit-muted focus:outline-none focus:border-cockpit-accent"
        />
        <input
          v-model="addName"
          type="text"
          placeholder="Display name (e.g., Groq)"
          class="w-full bg-cockpit-surface border border-cockpit-border rounded px-2 py-1 text-xs text-cockpit-text placeholder-cockpit-muted focus:outline-none focus:border-cockpit-accent"
        />
        <input
          v-model="addBaseUrl"
          type="text"
          placeholder="Base URL (e.g., https://api.groq.com)"
          class="w-full bg-cockpit-surface border border-cockpit-border rounded px-2 py-1 text-xs text-cockpit-text placeholder-cockpit-muted focus:outline-none focus:border-cockpit-accent"
          @keydown.enter="handleAddProvider"
        />
        <p v-if="addError" class="text-2xs text-cockpit-danger">{{ addError }}</p>
        <div class="flex gap-1">
          <button
            class="flex-1 px-2 py-1 text-xs rounded bg-cockpit-accent text-white hover:bg-cockpit-accent/80 transition-colors"
            @click="handleAddProvider"
          >
            Add
          </button>
          <button
            class="px-2 py-1 text-xs rounded text-cockpit-muted hover:text-cockpit-text transition-colors"
            @click="showAddForm = false; addError = ''"
          >
            Cancel
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
              {{ p.configured ? 'Configured' : 'Not configured' }}
            </div>
          </div>
        </div>
        <span class="text-2xs text-cockpit-muted flex-shrink-0 ml-1">{{ p.modelCount }}</span>
      </button>
    </div>

    <!-- 编辑区 -->
    <div class="flex-1 min-w-0">
      <div v-if="!selectedId" class="flex items-center justify-center h-full text-cockpit-muted text-sm">
        Select a provider from the list
      </div>

      <div v-else-if="loading" class="flex items-center justify-center h-full text-cockpit-muted text-sm">
        Loading...
      </div>

      <div v-else class="space-y-4">
        <!-- Provider 名称 -->
        <div>
          <label class="block text-xs text-cockpit-muted mb-1">Name</label>
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
          <label class="block text-xs text-cockpit-muted mb-1">API Base URL</label>
          <input
            v-model="editBaseUrl"
            type="text"
            class="w-full bg-cockpit-bg border border-cockpit-border rounded px-3 py-1.5 text-sm text-cockpit-text placeholder-cockpit-muted focus:outline-none focus:border-cockpit-accent"
            placeholder="https://api.example.com"
          />
        </div>

        <!-- API Key -->
        <div>
          <label class="block text-xs text-cockpit-muted mb-1">API Key</label>
          <div class="flex gap-1">
            <input
              v-model="editApiKey"
              :type="showApiKey ? 'text' : 'password'"
              class="flex-1 bg-cockpit-bg border border-cockpit-border rounded px-3 py-1.5 text-sm text-cockpit-text placeholder-cockpit-muted focus:outline-none focus:border-cockpit-accent font-mono"
              placeholder="Enter API Key"
            />
            <button
              class="px-2 py-1.5 text-xs rounded text-cockpit-muted hover:text-cockpit-text hover:bg-cockpit-border/30 transition-colors"
              @click="showApiKey = !showApiKey"
              :title="showApiKey ? 'Hide API Key' : 'Show API Key'"
            >
              {{ showApiKey ? '🙈' : '👁' }}
            </button>
          </div>
        </div>

        <!-- 默认模型 -->
        <div>
          <label class="block text-xs text-cockpit-muted mb-1">Default Model</label>
          <select
            class="w-full bg-cockpit-bg border border-cockpit-border rounded px-3 py-1.5 text-sm text-cockpit-text focus:outline-none focus:border-cockpit-accent"
            @change="(e: Event) => setDefaultModel((e.target as HTMLSelectElement).value)"
          >
            <option value="" disabled>Select default model</option>
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
            <label class="text-xs text-cockpit-muted">Models</label>
            <span class="text-2xs text-cockpit-muted">{{ editModels.length }} model(s)</span>
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
                  default
                </span>
              </div>
              <button
                class="text-cockpit-muted hover:text-cockpit-danger opacity-0 group-hover:opacity-100 transition-opacity text-xs flex-shrink-0 ml-2"
                @click="removeModel(idx)"
                title="Remove model"
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
              placeholder="model-id"
              class="flex-1 bg-cockpit-bg border border-cockpit-border rounded px-2 py-1 text-xs text-cockpit-text placeholder-cockpit-muted focus:outline-none focus:border-cockpit-accent font-mono"
              @keydown.enter="addModel"
            />
            <input
              v-model="newModelName"
              type="text"
              placeholder="Model name"
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
            class="px-4 py-1.5 text-xs rounded bg-cockpit-accent text-white hover:bg-cockpit-accent/80 transition-colors disabled:opacity-50"
            :disabled="saving"
            @click="handleSave"
          >
            {{ saving ? 'Saving...' : 'Save' }}
          </button>
          <button
            class="px-4 py-1.5 text-xs rounded bg-cockpit-border/30 text-cockpit-text hover:bg-cockpit-border/50 transition-colors"
            @click="handleReset"
          >
            Reset
          </button>
          <div class="flex-1"></div>
          <button
            v-if="!isBuiltin"
            class="px-4 py-1.5 text-xs rounded bg-cockpit-danger/10 text-cockpit-danger hover:bg-cockpit-danger/20 transition-colors"
            @click="handleDelete"
          >
            Delete
          </button>
          <span
            v-else
            class="px-4 py-1.5 text-xs text-cockpit-muted cursor-not-allowed"
            title="Built-in providers cannot be deleted"
          >
            Built-in
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>
