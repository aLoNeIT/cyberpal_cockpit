<script setup lang="ts">
import { computed } from 'vue';
import AgentCell from './AgentCell.vue';
import type { AgentInfo } from '@/types';

const props = defineProps<{
  agents: AgentInfo[];
  terminalOutputs: Map<string, string>;
  markdownOutputs: Map<string, string>;
}>();

const emit = defineEmits<{
  (e: 'send-input', agentId: string, input: string): void;
  (e: 'kill-agent', id: string): void;
}>();

const columnCount = computed(() => {
  const count = props.agents.length;
  if (count === 0) return 1;
  if (count === 1) return 1;
  return 2;
});
</script>

<template>
  <div class="flex-1 overflow-auto p-3">
    <div
      class="grid gap-3 h-full"
      :style="{
        gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
        gridAutoRows: '1fr',
      }"
    >
      <AgentCell
        v-for="agent in agents"
        :key="agent.id"
        :agent="agent"
        :terminal-output="terminalOutputs.get(agent.id) || ''"
        :markdown-output="markdownOutputs.get(agent.id) || ''"
        @send-input="(input) => emit('send-input', agent.id, input)"
        @kill="emit('kill-agent', agent.id)"
      />
    </div>
  </div>
</template>

<style scoped>
</style>
