<script setup lang="ts">
import { computed } from 'vue';
import type { AgentConversationEvent } from '@/types';

const props = defineProps<{
  events: AgentConversationEvent[];
}>();

const displayEvents = computed(() => {
  const merged: AgentConversationEvent[] = [];

  for (const event of props.events) {
    const previous = merged[merged.length - 1];
    if (canMerge(previous, event)) {
      merged[merged.length - 1] = {
        ...previous,
        id: `${previous.id}:${event.id}`,
        content: `${previous.content}${event.content}`,
        status: event.status ?? previous.status,
        metadata: { ...previous.metadata, ...event.metadata },
        createdAt: event.createdAt,
      };
    } else {
      merged.push(event);
    }
  }

  return merged;
});

function canMerge(previous: AgentConversationEvent | undefined, next: AgentConversationEvent): previous is AgentConversationEvent {
  if (!previous) return false;
  if (previous.agentId !== next.agentId) return false;
  if (previous.kind !== next.kind) return false;
  if (previous.title !== next.title) return false;
  return next.kind === 'assistant' || next.kind === 'thinking';
}

function labelFor(event: AgentConversationEvent): string {
  if (event.title) return event.title;
  const labels: Record<AgentConversationEvent['kind'], string> = {
    user: 'User',
    assistant: 'Assistant',
    working: 'Working',
    thinking: 'Thinking',
    tool: 'Command',
    summary: 'Summary',
    stderr: 'Error',
    system: 'System',
  };
  return labels[event.kind];
}

function markerClass(event: AgentConversationEvent): string {
  if (event.status === 'error' || event.kind === 'stderr') return 'bg-cockpit-danger';
  if (event.kind === 'summary') return 'bg-cockpit-success';
  if (event.kind === 'tool') return 'bg-cockpit-warning';
  if (event.kind === 'thinking') return 'bg-cockpit-accent';
  if (event.kind === 'user') return 'bg-cockpit-text';
  return 'bg-cockpit-muted';
}
</script>

<template>
  <div class="h-full overflow-y-auto bg-cockpit-surface-sunken/50">
    <div class="mx-auto w-full max-w-5xl px-6 py-4 sm:px-8 lg:px-10 space-y-3">
      <div v-if="displayEvents.length === 0" class="text-cockpit-muted text-sm text-center py-8">
        等待 Agent 输出...
      </div>

      <article
        v-for="event in displayEvents"
        :key="event.id"
        class="flex gap-3"
        :class="event.kind === 'user' ? 'justify-end' : 'justify-start'"
      >
        <template v-if="event.kind !== 'user'">
          <span class="mt-2 h-2 w-2 rounded-full flex-shrink-0" :class="markerClass(event)"></span>
        </template>

        <div
          class="max-w-[82%] rounded-md border px-3 py-2 text-sm leading-6"
          :class="event.kind === 'user'
            ? 'bg-cockpit-accent text-white border-cockpit-accent'
            : 'bg-cockpit-panel border-cockpit-border text-cockpit-text'"
        >
          <div
            v-if="event.kind !== 'assistant' || event.title"
            class="mb-1 flex items-center gap-2 text-[11px] font-medium uppercase tracking-normal"
            :class="event.kind === 'user' ? 'text-white/75' : 'text-cockpit-muted'"
          >
            <span>{{ labelFor(event) }}</span>
            <span v-if="event.status === 'running'" class="h-1.5 w-1.5 rounded-full bg-cockpit-accent animate-pulse"></span>
            <span v-if="event.status" class="normal-case">{{ event.status }}</span>
          </div>
          <pre
            v-if="event.kind === 'tool'"
            class="whitespace-pre-wrap break-words font-mono text-xs leading-5"
          >{{ event.content }}</pre>
          <p v-else class="whitespace-pre-wrap break-words">{{ event.content }}</p>
        </div>
      </article>
    </div>
  </div>
</template>
