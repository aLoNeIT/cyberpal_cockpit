<script setup lang="ts">
import { computed } from 'vue';
import AgentCell from './AgentCell.vue';
import AgentCellSummary from './AgentCellSummary.vue';
import type { AgentConversationEvent, AgentInfo } from '@/types';
import type { SendState } from '@/composables/useAgents';

const props = defineProps<{
  agents: AgentInfo[];
  terminalOutputs: Map<string, string>;
  markdownOutputs: Map<string, string>;
  conversationEvents: Map<string, AgentConversationEvent[]>;
  sendStates: Map<string, SendState>;
  activeAgentId: string | null;
}>();

const emit = defineEmits<{
  (e: 'send-input', agentId: string, input: string): void;
  (e: 'kill-agent', id: string): void;
  (e: 'focus-agent', id: string): void;
}>();

const columnCount = computed(() => {
  const count = props.agents.length;
  if (count === 0) return 1;
  if (count === 1) return 1;
  return 2;
});

const activeAgent = computed(() => props.agents.find((agent) => agent.id === props.activeAgentId) || null);
const summaryAgents = computed(() => props.agents.filter((agent) => agent.id !== props.activeAgentId));

function previewFor(agentId: string): string {
  const terminal = props.terminalOutputs.get(agentId) || '';
  const markdown = props.markdownOutputs.get(agentId) || '';
  return (markdown || terminal).trim().split(/\r?\n/).slice(-5).join('\n').trim();
}

function handleActiveSend(input: string): void {
  if (!activeAgent.value) return;
  emit('send-input', activeAgent.value.id, input);
}

function handleActiveKill(): void {
  if (!activeAgent.value) return;
  emit('kill-agent', activeAgent.value.id);
}

function handleSummarySend(agentId: string, input: string): void {
  emit('send-input', agentId, input);
}
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
        v-if="activeAgent"
        :key="activeAgent.id"
        :agent="activeAgent"
        :terminal-output="terminalOutputs.get(activeAgent.id) || ''"
        :markdown-output="markdownOutputs.get(activeAgent.id) || ''"
        :conversation-events="conversationEvents.get(activeAgent.id) || []"
        :send-state="sendStates.get(activeAgent.id) || null"
        @send-input="handleActiveSend"
        @kill="handleActiveKill"
      />

      <AgentCellSummary
        v-for="agent in summaryAgents"
        :key="agent.id"
        :agent="agent"
        :preview="previewFor(agent.id)"
        :send-state="sendStates.get(agent.id) || null"
        @focus="emit('focus-agent', agent.id)"
        @kill="emit('kill-agent', agent.id)"
        @send-input="(input: string) => handleSummarySend(agent.id, input)"
      />
    </div>
  </div>
</template>

<style scoped>
</style>
