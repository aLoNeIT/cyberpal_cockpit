<script setup lang="ts">
import { ref, onMounted } from 'vue';
import type { WorkspaceConfig, ModelInfo } from '@/types';
import * as api from '@/services/api';
import ModelSelector from './ModelSelector.vue';

const props = defineProps<{
  workspaces: WorkspaceConfig[];
}>();

const emit = defineEmits<{
  (e: 'confirm', cwd: string, workspaceId?: string, model?: string): void;
  (e: 'cancel'): void;
}>();

const mode = ref<'quick' | 'manual'>('quick');
const selectedWorkspaceId = ref<string | null>(null);
const manualCwd = ref('');
const errorMsg = ref('');

// Phase 3: 模型选择
const models = ref<ModelInfo[]>([]);
const selectedModel = ref<string | undefined>(undefined);
const modelsLoading = ref(false);

onMounted(async () => {
  modelsLoading.value = true;
  try {
    models.value = await api.fetchModels();
    const defaultModel = models.value.find((m) => m.isDefault);
    selectedModel.value = defaultModel?.id;
  } catch {
    console.warn('[AgentLauncher] Failed to load models');
  } finally {
    modelsLoading.value = false;
  }
});

function handleConfirm(): void {
  errorMsg.value = '';

  if (mode.value === 'quick') {
    if (!selectedWorkspaceId.value) {
      errorMsg.value = 'Please select a workspace';
      return;
    }
    const ws = props.workspaces.find(
      (w) => w.id === selectedWorkspaceId.value,
    );
    if (!ws) {
      errorMsg.value = 'Selected workspace not found';
      return;
    }
    emit('confirm', ws.path, ws.id, selectedModel.value);
  } else {
    if (!manualCwd.value.trim()) {
      errorMsg.value = 'Please enter a working directory';
      return;
    }
    emit('confirm', manualCwd.value.trim(), undefined, selectedModel.value);
  }
}

function handleCancel(): void {
  emit('cancel');
}
</script>

<template>
  <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
    <div class="bg-cockpit-panel border border-cockpit-border rounded-lg shadow-2xl w-[480px] max-w-[90vw] max-h-[80vh] overflow-y-auto">
      <div class="flex items-center justify-between px-4 py-3 border-b border-cockpit-border">
        <h2 class="text-base font-semibold text-cockpit-text tracking-tight">Launch Agent</h2>
        <button class="text-cockpit-muted hover:text-cockpit-text text-sm" @click="handleCancel">✕</button>
      </div>

      <div class="flex border-b border-cockpit-border">
        <button
          class="flex-1 py-2.5 text-xs font-medium transition-colors"
          :class="mode === 'quick' ? 'text-cockpit-accent border-b-2 border-cockpit-accent bg-cockpit-accent/5' : 'text-cockpit-muted hover:text-cockpit-text'"
          @click="mode = 'quick'"
        >
          Quick Launch (Workspace)
        </button>
        <button
          class="flex-1 py-2.5 text-xs font-medium transition-colors"
          :class="mode === 'manual' ? 'text-cockpit-accent border-b-2 border-cockpit-accent bg-cockpit-accent/5' : 'text-cockpit-muted hover:text-cockpit-text'"
          @click="mode = 'manual'"
        >
          Manual (Custom Path)
        </button>
      </div>

      <div v-if="mode === 'quick'" class="p-4">
        <p class="text-xs text-cockpit-muted mb-3">Select a workspace to use as the agent's working directory:</p>
        <div v-if="props.workspaces.length === 0" class="text-xs text-cockpit-muted text-center py-4">
          No workspaces configured. Add one in the left panel first.
        </div>
        <div class="space-y-1">
          <div
            v-for="ws in props.workspaces"
            :key="ws.id"
            class="flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-colors text-xs"
            :class="selectedWorkspaceId === ws.id ? 'bg-cockpit-accent/15 text-cockpit-accent ring-1 ring-cockpit-accent/30' : 'text-cockpit-text hover:bg-cockpit-border/30'"
            @click="selectedWorkspaceId = ws.id"
          >
            <span class="text-cockpit-muted">📁</span>
            <div class="flex-1 min-w-0">
              <div class="font-medium truncate">{{ ws.name }}</div>
              <div class="text-cockpit-muted text-2xs truncate">{{ ws.path }}</div>
            </div>
            <span v-if="selectedWorkspaceId === ws.id" class="text-cockpit-accent">✓</span>
          </div>
        </div>
      </div>

      <div v-else class="p-4">
        <p class="text-xs text-cockpit-muted mb-3">Enter the absolute path to the working directory:</p>
        <input
          v-model="manualCwd"
          type="text"
          placeholder="e.g., /home/user/projects/my-app"
          class="w-full bg-cockpit-bg border border-cockpit-border rounded px-3 py-2 text-sm text-cockpit-text placeholder-cockpit-muted focus:outline-none focus:border-cockpit-accent font-mono"
          @keydown.enter="handleConfirm"
        />
      </div>

      <p v-if="errorMsg" class="px-4 pb-2 text-xs text-cockpit-danger">{{ errorMsg }}</p>

      <!-- Phase 3: 模型选择 -->
      <div class="px-4 pb-3">
        <label class="text-xs text-cockpit-muted block mb-1">Model</label>
        <ModelSelector
          v-if="models.length > 0"
          :models="models"
          :current-model="selectedModel"
          mode="dropdown"
          @select="(id) => selectedModel = id"
        />
        <span v-else-if="modelsLoading" class="text-xs text-cockpit-muted">Loading models...</span>
      </div>

      <div class="flex justify-end gap-2 px-4 py-3 border-t border-cockpit-border">
        <button
          class="px-4 py-1.5 text-xs rounded bg-cockpit-border/30 text-cockpit-text hover:bg-cockpit-border/50 transition-colors"
          @click="handleCancel"
        >
          Cancel
        </button>
        <button
          class="px-4 py-1.5 text-xs rounded bg-cockpit-accent text-white hover:bg-cockpit-accent/80 transition-colors"
          @click="handleConfirm"
        >
          Launch
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>
