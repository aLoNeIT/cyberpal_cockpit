<script setup lang="ts">
import { ref } from 'vue';
import type { SessionTreeNode } from '@/types';

const props = withDefaults(defineProps<{
  nodes: SessionTreeNode[];
  depth?: number;
}>(), {
  depth: 0,
});

const emit = defineEmits<{
  (e: 'node-click', agentId: string): void;
}>();

const collapsedNodes = ref<Set<string>>(new Set());

function toggleCollapse(agentId: string): void {
  if (collapsedNodes.value.has(agentId)) {
    collapsedNodes.value.delete(agentId);
  } else {
    collapsedNodes.value.add(agentId);
  }
}

function isCollapsed(agentId: string): boolean {
  return collapsedNodes.value.has(agentId);
}

function getStatusDotClass(node: SessionTreeNode): string {
  if (node.isOrphaned) {
    return 'border border-dashed border-cockpit-muted bg-transparent';
  }
  if (node.status === 'running') return 'bg-cockpit-success';
  if (node.status === 'error') return 'bg-cockpit-danger';
  return 'bg-cockpit-muted';
}

function onNodeClick(agentId: string): void {
  emit('node-click', agentId);
}
</script>

<template>
  <div class="py-0.5">
    <template v-for="node in nodes" :key="node.agentId">
      <!-- 节点行 -->
      <div
        class="flex items-center gap-1 px-2 py-0.5 cursor-pointer hover:bg-cockpit-border/30 rounded transition-colors select-none text-xs"
        :style="{ paddingLeft: (props.depth * 20 + 8) + 'px' }"
        @click="onNodeClick(node.agentId)"
      >
        <!-- 折叠箭头 -->
        <span
          v-if="node.children.length > 0"
          class="text-cockpit-muted text-[10px] w-3 text-center cursor-pointer flex-shrink-0"
          @click.stop="toggleCollapse(node.agentId)"
        >
          {{ isCollapsed(node.agentId) ? '▶' : '▼' }}
        </span>
        <span v-else class="w-3 flex-shrink-0"></span>

        <!-- 状态圆点 -->
        <span
          class="w-2 h-2 rounded-full flex-shrink-0"
          :class="getStatusDotClass(node)"
        ></span>

        <!-- 标签 -->
        <span
          class="truncate"
          :class="{
            'text-cockpit-text': !node.isOrphaned,
            'text-cockpit-muted italic': node.isOrphaned,
          }"
        >
          {{ node.label }}
        </span>

        <!-- worker 数标签 -->
        <span
          v-if="node.children.length > 0"
          class="text-[10px] text-cockpit-muted bg-cockpit-bg px-1 rounded ml-auto flex-shrink-0"
        >
          {{ node.children.length }}
        </span>
      </div>

      <!-- 子节点（递归） -->
      <template v-if="node.children.length > 0 && !isCollapsed(node.agentId)">
        <SessionTree
          :nodes="node.children"
          :depth="props.depth + 1"
          @node-click="(id) => emit('node-click', id)"
        />
      </template>
    </template>
  </div>
</template>

<style scoped>
</style>
