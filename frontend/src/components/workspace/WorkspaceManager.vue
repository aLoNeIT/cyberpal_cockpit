<script setup lang="ts">
import { ref } from 'vue';
import type { WorkspaceConfig } from '@/types';
import WorkspaceDialog from './WorkspaceDialog.vue';

defineProps<{
  workspaces: WorkspaceConfig[];
  selectedWorkspaceId: string | null;
}>();

const emit = defineEmits<{
  (e: 'add-workspace', name: string, path: string): void;
  (e: 'remove-workspace', id: string): void;
  (e: 'select-workspace', id: string): void;
}>();

const showDialog = ref(false);

function handleConfirm(name: string, path: string): void {
  emit('add-workspace', name, path);
  showDialog.value = false;
}
</script>

<template>
  <div class="p-2">
    <!-- 标题 -->
    <div class="flex items-center justify-between mb-2">
      <span class="type-label text-cockpit-muted">Workspaces</span>
      <button
        class="text-xs text-cockpit-accent hover:text-cockpit-accent/80 transition-colors"
        @click="showDialog = true"
      >
        +
      </button>
    </div>

    <!-- 工作区列表 -->
    <div class="space-y-0.5">
      <div
        v-for="ws in workspaces"
        :key="ws.id"
        class="flex items-center justify-between px-2 py-1 rounded text-xs cursor-pointer transition-colors group"
        :class="selectedWorkspaceId === ws.id ? 'bg-cockpit-accent/15 text-cockpit-accent' : 'text-cockpit-text hover:bg-cockpit-border/30'"
        @click="emit('select-workspace', ws.id)"
      >
        <div class="flex items-center gap-1.5 truncate flex-1 min-w-0">
          <span class="text-cockpit-muted">📁</span>
          <span class="truncate">{{ ws.name }}</span>
        </div>
        <button
          class="text-cockpit-muted hover:text-cockpit-danger opacity-0 group-hover:opacity-100 transition-opacity ml-1 flex-shrink-0"
          @click.stop="emit('remove-workspace', ws.id)"
          title="Remove workspace"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- 创建工作区弹窗 -->
    <WorkspaceDialog
      :open="showDialog"
      @close="showDialog = false"
      @confirm="handleConfirm"
    />
  </div>
</template>

<style scoped>
</style>
