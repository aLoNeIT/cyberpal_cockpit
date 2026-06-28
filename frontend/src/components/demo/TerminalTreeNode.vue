<script setup lang="ts">
import type { TerminalFileEntry } from '@/types';

const props = withDefaults(defineProps<{
  entries: TerminalFileEntry[];
  expandedPaths: Set<string>;
  depth?: number;
}>(), {
  depth: 0,
});

const emit = defineEmits<{
  toggle: [entry: TerminalFileEntry];
}>();

function formatSize(entry: TerminalFileEntry): string {
  if (entry.type === 'directory') return '';
  if (entry.size < 1024) return `${entry.size} B`;
  if (entry.size < 1024 * 1024) return `${(entry.size / 1024).toFixed(1)} KB`;
  return `${(entry.size / 1024 / 1024).toFixed(1)} MB`;
}

function directoryIcon(entry: TerminalFileEntry): string {
  return props.expandedPaths.has(entry.path) ? 'v' : '>';
}

function pathKey(path: string): string {
  return encodeURIComponent(path);
}

function handleToggle(entry: TerminalFileEntry): void {
  emit('toggle', entry);
}
</script>

<template>
  <template
    v-for="entry in entries"
    :key="entry.path"
  >
    <button
      class="w-full h-8 pr-3 grid grid-cols-[14px_20px_minmax(0,1fr)_auto] items-center gap-1.5 text-left text-xs font-mono hover:bg-cockpit-surface-hover"
      :style="{ paddingLeft: `${12 + depth * 20}px` }"
      :data-testid="`tree-item-${pathKey(entry.path)}`"
      :title="entry.path"
      @click="handleToggle(entry)"
    >
      <span
        class="text-cockpit-muted text-[11px]"
        :data-testid="entry.type === 'directory' ? `toggle-${pathKey(entry.path)}` : undefined"
      >
        {{ entry.type === 'directory' ? directoryIcon(entry) : '' }}
      </span>
      <span
        :data-testid="`icon-${entry.type === 'directory' ? 'folder' : 'file'}-${pathKey(entry.path)}`"
        class="terminal-tree-icon"
        :class="[
          entry.type === 'directory' ? 'terminal-tree-folder' : 'terminal-tree-file',
          expandedPaths.has(entry.path) ? 'is-open' : '',
        ]"
      ></span>
      <span class="truncate">{{ entry.name }}</span>
      <span class="text-[11px] text-cockpit-muted">{{ formatSize(entry) }}</span>
    </button>

    <TerminalTreeNode
      v-if="entry.type === 'directory' && expandedPaths.has(entry.path)"
      :entries="entry.children || []"
      :expanded-paths="expandedPaths"
      :depth="depth + 1"
      @toggle="handleToggle"
    />
  </template>
</template>

<style scoped>
.terminal-tree-icon {
  position: relative;
  display: inline-block;
  width: 15px;
  height: 13px;
}

.terminal-tree-folder::before {
  content: '';
  position: absolute;
  left: 1px;
  top: 2px;
  width: 7px;
  height: 3px;
  border: 1px solid rgb(129 140 248 / 0.85);
  border-bottom: 0;
  border-radius: 2px 2px 0 0;
  background: rgb(49 57 89);
}

.terminal-tree-folder::after {
  content: '';
  position: absolute;
  left: 0;
  top: 5px;
  width: 15px;
  height: 8px;
  border: 1px solid rgb(129 140 248 / 0.9);
  border-radius: 2px;
  background: rgb(31 37 68);
}

.terminal-tree-folder.is-open::after {
  background: rgb(42 48 84);
}

.terminal-tree-file::before {
  content: '';
  position: absolute;
  left: 2px;
  top: 0;
  width: 11px;
  height: 13px;
  border: 1px solid rgb(148 163 184 / 0.85);
  border-radius: 2px;
  background: rgb(20 24 40);
}

.terminal-tree-file::after {
  content: '';
  position: absolute;
  right: 2px;
  top: 0;
  width: 5px;
  height: 5px;
  border-left: 1px solid rgb(148 163 184 / 0.75);
  border-bottom: 1px solid rgb(148 163 184 / 0.75);
  background: rgb(31 37 68);
}
</style>
