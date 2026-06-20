<script setup lang="ts">
import { computed } from 'vue';
import type { AgentInfo } from '@/types';
import type { SendState } from '@/composables/useAgents';

const props = defineProps<{
  agent: AgentInfo;
  preview: string;
  sendState: SendState | null;
}>();

const emit = defineEmits<{
  (e: 'focus'): void;
  (e: 'kill'): void;
}>();

const displayName = computed(() => props.agent.cwd.split(/[/\\]/).filter(Boolean).pop() || props.agent.cwd);
const statusLabel = computed(() => {
  if (props.sendState?.phase === 'sending') return '发送中';
  if (props.sendState?.phase === 'busy') return '处理中';
  if (props.sendState?.phase === 'error') return '失败';
  return props.agent.status === 'running' ? '运行中' : props.agent.status;
});
</script>

<template>
  <button
    type="button"
    class="flex h-full min-h-[220px] w-full flex-col overflow-hidden rounded-md border border-cockpit-border bg-cockpit-panel text-left shadow-cockpit-sm transition-all duration-200 hover:-translate-y-px hover:shadow-cockpit-md"
    @click="emit('focus')"
  >
    <div class="flex items-center justify-between gap-2 border-b border-cockpit-border bg-cockpit-bg/60 px-3 py-2">
      <div class="min-w-0">
        <div class="truncate text-xs font-medium text-cockpit-text">{{ displayName }}</div>
        <div class="text-[11px] text-cockpit-muted">{{ statusLabel }}</div>
      </div>
      <span
        class="shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] uppercase tracking-normal"
        :class="props.sendState?.phase === 'error'
          ? 'bg-cockpit-danger-subtle text-cockpit-danger'
          : props.sendState?.phase === 'busy' || props.sendState?.phase === 'sending'
            ? 'bg-cockpit-accent-subtle text-cockpit-accent'
            : 'bg-cockpit-surface-sunken text-cockpit-muted'"
      >
        {{ props.sendState?.phase || 'idle' }}
      </span>
      <button
        type="button"
        class="shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] text-cockpit-muted hover:text-cockpit-danger hover:bg-cockpit-danger-subtle transition-colors"
        title="关闭 Agent"
        @click.stop="emit('kill')"
      >
        ✕
      </button>
    </div>

    <div class="flex flex-1 flex-col justify-between gap-3 px-3 py-3">
      <p class="line-clamp-5 text-sm leading-6 text-cockpit-text/85">
        {{ preview || '等待输出...' }}
      </p>

      <div
        v-if="sendState"
        class="rounded-sm border px-2 py-1 text-xs leading-5"
        :class="sendState.phase === 'error'
          ? 'border-cockpit-danger/40 bg-cockpit-danger-subtle text-cockpit-danger'
          : 'border-cockpit-border bg-cockpit-surface-sunken text-cockpit-muted'"
      >
        {{ sendState.message }}
      </div>
    </div>
  </button>
</template>

<style scoped>
.line-clamp-5 {
  display: -webkit-box;
  -webkit-line-clamp: 5;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
</style>
