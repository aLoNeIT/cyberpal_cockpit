<script setup lang="ts">
import { ref } from 'vue';
import type { FileTreeNode } from '@/types';

defineProps<{
  nodes: FileTreeNode[];
}>();

const emit = defineEmits<{
  (e: 'file-click', filePath: string): void;
}>();

const expandedDirs = ref<Set<string>>(new Set());

function toggleDir(path: string): void {
  if (expandedDirs.value.has(path)) {
    expandedDirs.value.delete(path);
  } else {
    expandedDirs.value.add(path);
  }
}

function isExpanded(path: string): boolean {
  return expandedDirs.value.has(path);
}

function getIcon(node: FileTreeNode): string {
  if (node.type === 'directory') {
    return isExpanded(node.path) ? '📂' : '📁';
  }
  // 文件图标基于扩展名
  const ext = node.name.split('.').pop()?.toLowerCase();
  const iconMap: Record<string, string> = {
    ts: '🟦',
    tsx: '⚛️',
    js: '🟨',
    jsx: '⚛️',
    json: '📋',
    md: '📝',
    html: '🌐',
    css: '🎨',
    scss: '🎨',
    vue: '💚',
    py: '🐍',
    go: '🔵',
    rs: '🦀',
    yaml: '⚙️',
    yml: '⚙️',
    toml: '⚙️',
    env: '🔒',
    gitignore: '🔒',
    sh: '⚡',
    sql: '🗃️',
    xml: '📄',
    png: '🖼️',
    jpg: '🖼️',
    jpeg: '🖼️',
    gif: '🖼️',
    svg: '🖼️',
  };
  return iconMap[ext || ''] || '📄';
}
</script>

<template>
  <div class="py-1">
    <template v-for="node in nodes" :key="node.path">
      <!-- 目录 -->
      <div
        v-if="node.type === 'directory'"
        class="pl-2"
      >
        <div
          class="flex items-center gap-1 px-2 py-0.5 text-xs cursor-pointer hover:bg-cockpit-border/30 rounded transition-colors select-none"
          @click="toggleDir(node.path)"
        >
          <span class="text-cockpit-muted text-[10px] w-3 text-center">
            {{ isExpanded(node.path) ? '▼' : '▶' }}
          </span>
          <span>{{ getIcon(node) }}</span>
          <span class="truncate text-cockpit-text">{{ node.name }}</span>
        </div>

        <!-- 子节点 -->
        <div v-if="isExpanded(node.path) && node.children && node.children.length > 0" class="ml-3">
          <WorkspaceTree
            :nodes="node.children"
            @file-click="(path) => emit('file-click', path)"
          />
        </div>
        <div v-else-if="isExpanded(node.path) && (!node.children || node.children.length === 0)" class="ml-3 pl-7 py-0.5 text-[10px] text-cockpit-muted">
          (empty)
        </div>
      </div>

      <!-- 文件 -->
      <div
        v-else
        class="flex items-center gap-1 px-2 py-0.5 text-xs cursor-pointer hover:bg-cockpit-accent/10 rounded transition-colors ml-3"
        @click="emit('file-click', node.path)"
      >
        <span class="w-3"></span>
        <span>{{ getIcon(node) }}</span>
        <span class="truncate text-cockpit-text">{{ node.name }}</span>
      </div>
    </template>
  </div>
</template>

<style scoped>
</style>
