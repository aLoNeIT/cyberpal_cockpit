<script setup lang="ts">
import type { AgentInfo } from '@/types';

defineProps<{
  agents: AgentInfo[];
  activeAgentId: string | null;
}>();

const emit = defineEmits<{
  (e: 'tab-click', id: string): void;
  (e: 'tab-close', id: string): void;
}>();

function displayName(agent: AgentInfo): string {
  return agent.cwd.split(/[/\\]/).filter(Boolean).pop() || agent.cwd;
}
</script>

<template>
  <div class="flex items-center gap-0 bg-cockpit-panel border-b border-cockpit-border overflow-x-auto flex-shrink-0">
    <div
      v-for="agent in agents"
      :key="agent.id"
      class="flex items-center gap-1 px-3 py-1.5 text-xs cursor-pointer border-r border-cockpit-border transition-colors flex-shrink-0"
      :class="activeAgentId === agent.id ? 'bg-cockpit-bg text-cockpit-accent border-t-2 border-t-cockpit-accent' : 'text-cockpit-muted hover:text-cockpit-text hover:bg-cockpit-bg/50'"
      @click="emit('tab-click', agent.id)"
    >
      <span
        class="w-1.5 h-1.5 rounded-full"
        :class="{
          'bg-cockpit-success': agent.status === 'running',
          'bg-cockpit-muted': agent.status === 'stopped',
          'bg-cockpit-danger': agent.status === 'error',
        }"
      ></span>
      <span class="truncate max-w-[120px]">{{ displayName(agent) }}</span>
      <button
        class="ml-1 text-cockpit-muted hover:text-cockpit-danger leading-none"
        @click.stop="emit('tab-close', agent.id)"
        title="Close agent"
      >
        ✕
      </button>
    </div>

    <!-- 无 agent 时的占位 -->
    <div v-if="agents.length === 0" class="px-3 py-1.5 text-xs text-cockpit-muted">
      No agents
    </div>
  </div>
</template>

<style scoped>
</style>
