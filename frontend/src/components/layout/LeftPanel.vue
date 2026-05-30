<script setup lang="ts">
import WorkspaceManager from '@/components/workspace/WorkspaceManager.vue';
import WorkspaceTree from '@/components/workspace/WorkspaceTree.vue';
import SessionTree from '@/components/session/SessionTree.vue';
import type { WorkspaceConfig, FileTreeNode, SessionTreeNode } from '@/types';
import type { LeftPanelTab } from '@/composables/useLayout';

defineProps<{
  workspaces: WorkspaceConfig[];
  selectedWorkspaceId: string | null;
  treeData: FileTreeNode[];
  expanded: boolean;
  leftPanelTab: LeftPanelTab;
  sessionTreeNodes: SessionTreeNode[];
}>();

const emit = defineEmits<{
  (e: 'add-workspace', name: string, path: string, projectPaths: string[]): void;
  (e: 'remove-workspace', id: string): void;
  (e: 'select-workspace', id: string): void;
  (e: 'toggle-tree', id: string): void;
  (e: 'file-click', filePath: string): void;
  (e: 'refresh-tree'): void;
  (e: 'tab-change', tab: LeftPanelTab): void;
  (e: 'session-node-click', agentId: string): void;
}>();
</script>

<template>
  <div class="h-full flex flex-col bg-cockpit-panel border-r border-cockpit-border">
    <!-- Phase 2: 标签切换 -->
    <div class="flex border-b border-cockpit-border flex-shrink-0">
      <button
        class="flex-1 py-2.5 text-xs font-medium transition-colors"
        :class="leftPanelTab === 'workspace'
          ? 'text-cockpit-accent border-b-2 border-cockpit-accent bg-cockpit-accent/5'
          : 'text-cockpit-muted hover:text-cockpit-text hover:bg-cockpit-border/20'"
        @click="emit('tab-change', 'workspace')"
      >
        工作区
      </button>
      <button
        class="flex-1 py-2 text-xs font-medium transition-colors border-l border-cockpit-border"
        :class="leftPanelTab === 'session'
          ? 'text-cockpit-accent border-b-2 border-cockpit-accent bg-cockpit-accent/5'
          : 'text-cockpit-muted hover:text-cockpit-text hover:bg-cockpit-border/20'"
        @click="emit('tab-change', 'session')"
      >
        会话
      </button>
    </div>

    <!-- 工作区视图 -->
    <template v-if="leftPanelTab === 'workspace'">
      <div class="flex-shrink-0 border-b border-cockpit-border">
        <WorkspaceManager
          :workspaces="workspaces"
          :selected-workspace-id="selectedWorkspaceId"
          @add-workspace="(name, path, projectPaths) => emit('add-workspace', name, path, projectPaths)"
          @remove-workspace="(id) => emit('remove-workspace', id)"
          @select-workspace="(id) => emit('select-workspace', id)"
        />
      </div>

      <div class="flex-1 overflow-y-auto">
        <div v-if="!selectedWorkspaceId" class="flex items-center justify-center h-full text-cockpit-muted text-sm p-4 text-center">
          选择或添加工作区以浏览文件
        </div>
        <WorkspaceTree
          v-else-if="treeData.length > 0"
          :nodes="treeData"
          @file-click="(path) => emit('file-click', path)"
        />
        <div v-else class="flex items-center justify-center h-full text-cockpit-muted text-sm p-4 text-center">
          正在加载目录树...
        </div>
      </div>

      <div class="flex-shrink-0 border-t border-cockpit-border p-2">
        <button
          class="w-full text-xs text-cockpit-muted hover:text-cockpit-text py-1 rounded hover:bg-cockpit-border/30 transition-colors"
          @click="emit('refresh-tree')"
        >
          ↻ 刷新
        </button>
      </div>
    </template>

    <!-- 会话树视图 -->
    <template v-else>
      <div class="flex-1 overflow-y-auto">
        <div v-if="sessionTreeNodes.length === 0" class="flex items-center justify-center h-full text-cockpit-muted text-sm p-4 text-center">
          暂无活跃会话
        </div>
        <SessionTree
          v-else
          :nodes="sessionTreeNodes"
          @node-click="(agentId) => emit('session-node-click', agentId)"
        />
      </div>
    </template>
  </div>
</template>

<style scoped>
</style>
