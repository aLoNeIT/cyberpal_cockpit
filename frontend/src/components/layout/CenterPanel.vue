<script setup lang="ts">
import { computed } from 'vue';
import AgentGrid from '@/components/agent/AgentGrid.vue';
import AgentTabBar from '@/components/agent/AgentTabBar.vue';
import AgentCell from '@/components/agent/AgentCell.vue';
import type { AgentInfo } from '@/types';
import type { LayoutMode } from '@/composables/useLayout';

const props = defineProps<{
  mode: LayoutMode;
  agents: AgentInfo[];
  activeAgentId: string | null;
  terminalOutputs: Map<string, string>;
  markdownOutputs: Map<string, string>;
}>();

const emit = defineEmits<{
  (e: 'tab-click', id: string): void;
  (e: 'tab-close', id: string): void;
  (e: 'send-input', agentId: string, input: string): void;
  (e: 'kill-agent', id: string): void;
}>();

const activeAgent = computed(() => {
  if (!props.activeAgentId) return null;
  return props.agents.find((a) => a.id === props.activeAgentId) || null;
});
</script>

<template>
  <div class="h-full flex flex-col bg-cockpit-bg">
    <!-- 单屏模式标签栏 -->
    <AgentTabBar
      v-if="mode === 'single'"
      :agents="agents"
      :active-agent-id="activeAgentId"
      @tab-click="(id) => emit('tab-click', id)"
      @tab-close="(id) => emit('tab-close', id)"
    />

    <!-- N 宫格模式 -->
    <AgentGrid
      v-if="mode === 'grid'"
      :agents="agents"
      :terminal-outputs="terminalOutputs"
      :markdown-outputs="markdownOutputs"
      @send-input="(agentId, input) => emit('send-input', agentId, input)"
      @kill-agent="(id) => emit('kill-agent', id)"
    />

    <!-- 单屏模式：显示 active agent -->
    <div v-if="mode === 'single' && activeAgent" class="flex-1 overflow-hidden p-3">
      <AgentCell
        :key="activeAgent.id"
        :agent="activeAgent"
        :terminal-output="terminalOutputs.get(activeAgent.id) || ''"
        :markdown-output="markdownOutputs.get(activeAgent.id) || ''"
        @send-input="(input) => emit('send-input', activeAgent.id, input)"
        @kill="emit('kill-agent', activeAgent.id)"
      />
    </div>

    <!-- 空状态 -->
    <div
      v-if="agents.length === 0"
      class="flex-1 flex items-center justify-center"
    >
      <div class="text-center">
        <div class="text-4xl mb-3 text-cockpit-muted">⊞</div>
        <p class="text-cockpit-muted text-sm">暂无运行中的 Agent</p>
        <p class="text-cockpit-muted/60 text-xs mt-1">点击顶部栏的「+ Agent」来启动一个</p>
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>
