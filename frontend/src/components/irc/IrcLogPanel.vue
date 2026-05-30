<script setup lang="ts">
import { ref } from 'vue';
import type { IrcMessage, AgentInfo } from '@/types';
import type { IrcFilter } from '@/composables/useIrcLog';

defineProps<{
  messages: IrcMessage[];
  filter: IrcFilter;
  availableAgents: AgentInfo[];
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'set-filter', filter: Partial<IrcFilter>): void;
  (e: 'clear-filter'): void;
}>();

const filterFrom = ref('');
const filterTo = ref('');
const filterType = ref<'all' | 'dm' | 'broadcast'>('all');

function applyFilter(): void {
  emit('set-filter', {
    from: filterFrom.value || undefined,
    to: filterTo.value || undefined,
    type: filterType.value === 'all' ? undefined : filterType.value,
  });
}

function resetFilter(): void {
  filterFrom.value = '';
  filterTo.value = '';
  filterType.value = 'all';
  emit('clear-filter');
}

function agentLabel(agentId: string, agents: AgentInfo[]): string {
  const agent = agents.find((a) => a.id === agentId);
  if (agent && agent.taskDescription) return agent.taskDescription;
  return agentId.slice(0, 8);
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString();
}
</script>

<template>
  <div class="fixed right-0 top-10 bottom-0 z-30 w-80 bg-cockpit-panel border-l border-cockpit-border shadow-2xl flex flex-col transition-transform duration-300">
    <!-- 头部 -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-cockpit-border flex-shrink-0">
      <div class="flex items-center gap-2">
        <span class="text-sm">💬</span>
        <span class="type-label text-cockpit-text">IRC Log</span>
      </div>
      <button
        class="text-cockpit-muted hover:text-cockpit-text text-sm"
        @click="emit('close')"
      >
        ✕
      </button>
    </div>

    <!-- 过滤栏 -->
    <div class="flex-shrink-0 border-b border-cockpit-border p-2 space-y-1.5">
      <div class="flex gap-1">
        <select
          v-model="filterType"
          class="flex-1 bg-cockpit-bg border border-cockpit-border rounded px-1.5 py-1 text-2xs text-cockpit-text focus:outline-none focus:border-cockpit-accent"
          @change="applyFilter"
        >
          <option value="all">All Types</option>
          <option value="dm">DM Only</option>
          <option value="broadcast">Broadcast Only</option>
        </select>
        <button
          class="text-2xs px-2 py-1 rounded text-cockpit-muted hover:text-cockpit-text hover:bg-cockpit-border/30 transition-colors"
          @click="resetFilter"
        >
          Reset
        </button>
      </div>
      <div class="flex gap-1">
        <select
          v-model="filterFrom"
          class="flex-1 bg-cockpit-bg border border-cockpit-border rounded px-1.5 py-1 text-2xs text-cockpit-text focus:outline-none focus:border-cockpit-accent"
          @change="applyFilter"
        >
          <option value="">All Senders</option>
          <option v-for="a in availableAgents" :key="a.id" :value="a.id">
            {{ agentLabel(a.id, availableAgents) }}
          </option>
        </select>
        <select
          v-model="filterTo"
          class="flex-1 bg-cockpit-bg border border-cockpit-border rounded px-1.5 py-1 text-2xs text-cockpit-text focus:outline-none focus:border-cockpit-accent"
          @change="applyFilter"
        >
          <option value="">All Recipients</option>
          <option v-for="a in availableAgents" :key="a.id" :value="a.id">
            {{ agentLabel(a.id, availableAgents) }}
          </option>
        </select>
      </div>
    </div>

    <!-- 消息列表 -->
    <div class="flex-1 overflow-y-auto p-2 space-y-1.5">
      <div v-if="messages.length === 0" class="flex items-center justify-center h-full text-cockpit-muted text-xs text-center p-4">
        No IRC messages yet.<br/>Agent IRC communication will appear here.
      </div>

      <div
        v-for="msg in messages"
        :key="msg.id"
        class="rounded px-2 py-1.5 text-xs transition-colors"
        :class="msg.type === 'broadcast'
          ? 'bg-cockpit-accent/10 border border-cockpit-accent/20'
          : 'bg-cockpit-bg/50 border border-cockpit-border/30'"
      >
        <!-- 头部：类型 + 时间 -->
        <div class="flex items-center justify-between mb-0.5">
          <span
            class="text-2xs px-1 rounded font-medium"
            :class="msg.type === 'broadcast'
              ? 'bg-cockpit-accent/20 text-cockpit-accent'
              : 'bg-cockpit-success/20 text-cockpit-success'"
          >
            {{ msg.type === 'broadcast' ? '📢 Broadcast' : '✉ DM' }}
          </span>
          <span class="text-2xs text-cockpit-muted">{{ formatTime(msg.timestamp) }}</span>
        </div>

        <!-- 路由信息 -->
        <div class="flex items-center gap-1 text-2xs mb-1">
          <span class="text-cockpit-accent font-mono">{{ agentLabel(msg.from, availableAgents) }}</span>
          <template v-if="msg.to">
            <span class="text-cockpit-muted">→</span>
            <span class="text-cockpit-success font-mono">{{ agentLabel(msg.to, availableAgents) }}</span>
          </template>
          <template v-else>
            <span class="text-cockpit-muted">→ all</span>
          </template>
        </div>

        <!-- 消息内容 -->
        <pre class="text-cockpit-text whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">{{ msg.message }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>
