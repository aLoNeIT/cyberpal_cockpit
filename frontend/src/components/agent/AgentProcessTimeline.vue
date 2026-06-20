<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import type { AgentConversationEvent } from '@/types';
import { renderMarkdown } from '@/utils/markdown';

const ESTIMATED_EVENT_HEIGHT = 20;
const VIRTUAL_OVERSCAN = 8;
const VIRTUALIZATION_THRESHOLD = 80;

const props = defineProps<{
  events: AgentConversationEvent[];
}>();

const detailsExpanded = ref(false);
const scrollerRef = ref<HTMLDivElement | null>(null);
const scrollTop = ref(0);
const viewportHeight = ref(640);
const anchoredToBottom = ref(true);

const hasAssistantOutput = computed(() => props.events.some((event) => event.kind === 'assistant'));

function isDetailEvent(event: AgentConversationEvent): boolean {
  if (isImportantEvent(event)) return false;
  return !['user', 'assistant'].includes(event.kind);
}

function isImportantEvent(event: AgentConversationEvent): boolean {
  return event.kind === 'stderr' || event.status === 'error';
}

const detailEvents = computed(() => {
  if (!hasAssistantOutput.value) return [];
  return props.events.filter(isDetailEvent);
});

const visibleSourceEvents = computed(() => {
  if (!hasAssistantOutput.value) {
    return props.events;
  }

  return props.events.filter((event) => {
    return !isDetailEvent(event) || detailsExpanded.value;
  });
});

const shouldVirtualize = computed(() => visibleSourceEvents.value.length > VIRTUALIZATION_THRESHOLD);
const effectiveScrollTop = computed(() => {
  return anchoredToBottom.value
    ? Math.max(0, visibleSourceEvents.value.length * ESTIMATED_EVENT_HEIGHT - viewportHeight.value)
    : scrollTop.value;
});
const virtualRange = computed(() => {
  if (!shouldVirtualize.value) {
    return { start: 0, end: visibleSourceEvents.value.length };
  }

  const visibleCount = Math.max(
    1,
    Math.ceil(viewportHeight.value / ESTIMATED_EVENT_HEIGHT) + VIRTUAL_OVERSCAN * 2,
  );
  const firstVisible = Math.floor(effectiveScrollTop.value / ESTIMATED_EVENT_HEIGHT);
  const maxStart = Math.max(0, visibleSourceEvents.value.length - visibleCount);
  const start = Math.min(Math.max(0, firstVisible - VIRTUAL_OVERSCAN), maxStart);
  const end = Math.min(visibleSourceEvents.value.length, start + visibleCount);

  return { start, end };
});

const virtualTopPad = computed(() => virtualRange.value.start * ESTIMATED_EVENT_HEIGHT);
const virtualBottomPad = computed(() => Math.max(0, (visibleSourceEvents.value.length - virtualRange.value.end) * ESTIMATED_EVENT_HEIGHT));
const virtualEvents = computed(() => {
  if (!shouldVirtualize.value) {
    return mergeAdjacentEvents(visibleSourceEvents.value);
  }
  return mergeAdjacentEvents(visibleSourceEvents.value.slice(virtualRange.value.start, virtualRange.value.end));
});

const mergedEvents = computed(() => virtualEvents.value);
const displayEvents = computed(() => mergedEvents.value);

function toggleDetails(): void {
  detailsExpanded.value = !detailsExpanded.value;
  nextTick(() => updateViewportMetrics());
}

function scrollToBottom(): void {
  if (!scrollerRef.value) return;
  const targetScrollTop = Math.max(0, visibleSourceEvents.value.length * ESTIMATED_EVENT_HEIGHT - viewportHeight.value);
  scrollTop.value = targetScrollTop;
  anchoredToBottom.value = true;
  scrollerRef.value.scrollTop = targetScrollTop;
  updateViewportMetrics();
}

function updateViewportMetrics(): void {
  if (!scrollerRef.value) return;
  scrollTop.value = scrollerRef.value.scrollTop;
  viewportHeight.value = scrollerRef.value.clientHeight || viewportHeight.value;
}

function handleScroll(): void {
  updateViewportMetrics();
  anchoredToBottom.value = false;
}

watch(
  () => props.events.length,
  async () => {
    await nextTick();
    scrollToBottom();
  },
);

onMounted(() => {
  updateViewportMetrics();
  scrollToBottom();
});

function canMerge(previous: AgentConversationEvent | undefined, next: AgentConversationEvent): previous is AgentConversationEvent {
  if (!previous) return false;
  if (previous.agentId !== next.agentId) return false;
  if (previous.kind !== next.kind) return false;
  if (previous.title !== next.title) return false;
  return next.kind === 'assistant' || next.kind === 'thinking';
}

function mergeAdjacentEvents(events: AgentConversationEvent[]): AgentConversationEvent[] {
  const merged: AgentConversationEvent[] = [];
  for (const event of events) {
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
}

function isConversationEvent(event: AgentConversationEvent): boolean {
  return event.kind === 'user' || event.kind === 'assistant';
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

function formatMetadataValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function formatToolContent(event: AgentConversationEvent): string {
  const parts: string[] = [];
  if (event.content) {
    parts.push(event.content);
  }

  const metadata = event.metadata ?? {};
  const args = metadata.args;
  const command = typeof args === 'object' && args !== null
    ? (args as { command?: unknown }).command
    : undefined;
  const formattedCommand = formatMetadataValue(command);
  const formattedArgs = formatMetadataValue(args);
  const formattedResult = formatMetadataValue(metadata.result);
  const formattedPartialResult = formatMetadataValue(metadata.partialResult);

  if (formattedCommand && !parts.includes(formattedCommand)) {
    parts.push(formattedCommand);
  } else if (formattedArgs && !parts.includes(formattedArgs)) {
    parts.push(formattedArgs);
  }
  if (formattedResult && !parts.includes(formattedResult)) {
    parts.push(formattedResult);
  }
  if (formattedPartialResult && !parts.includes(formattedPartialResult)) {
    parts.push(formattedPartialResult);
  }

  return parts.join('\n');
}
</script>

<template>
  <div
    ref="scrollerRef"
    data-testid="process-timeline-scroll"
    class="h-full overflow-y-auto bg-cockpit-surface-sunken/50"
    @scroll="handleScroll"
  >
    <div class="mx-auto w-full max-w-5xl px-6 py-4 sm:px-8 lg:px-10 space-y-3">
      <div v-if="mergedEvents.length === 0" class="text-cockpit-muted text-sm text-center py-8">
        等待 Agent 输出...
      </div>

      <div
        v-if="shouldVirtualize"
        data-testid="conversation-window-notice"
        class="rounded-sm border border-cockpit-border bg-cockpit-panel px-3 py-2 text-xs text-cockpit-muted"
      >
        长对话已启用可视区域渲染
      </div>

      <button
        v-if="detailEvents.length > 0"
        type="button"
        data-testid="process-details-toggle"
        class="inline-flex items-center gap-1 rounded-sm border border-cockpit-border bg-cockpit-panel px-2 py-1 text-xs text-cockpit-muted hover:text-cockpit-text hover:bg-cockpit-surface-hover transition-colors duration-150"
        :aria-expanded="detailsExpanded"
        @click="toggleDetails"
      >
        <span>{{ detailsExpanded ? '▾' : '▸' }}</span>
        <span>过程详情</span>
      </button>

      <div v-if="shouldVirtualize" aria-hidden="true" :style="{ height: `${virtualTopPad}px` }"></div>

      <article
        v-for="event in virtualEvents"
        :key="event.id"
        :data-testid="isConversationEvent(event) ? 'conversation-message' : undefined"
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
          >{{ formatToolContent(event) }}</pre>
          <div
            v-else-if="event.kind === 'assistant'"
            class="agent-message-markdown"
            v-html="renderMarkdown(event.content)"
          ></div>
          <p v-else class="whitespace-pre-wrap break-words">{{ event.content }}</p>
        </div>
      </article>

      <div v-if="shouldVirtualize" aria-hidden="true" :style="{ height: `${virtualBottomPad}px` }"></div>
    </div>
  </div>
</template>

<style scoped>
.agent-message-markdown {
  word-break: break-word;
}

.agent-message-markdown :deep(p) {
  margin-bottom: 0.65em;
  white-space: normal;
}

.agent-message-markdown :deep(p:last-child),
.agent-message-markdown :deep(ul:last-child),
.agent-message-markdown :deep(pre:last-child) {
  margin-bottom: 0;
}

.agent-message-markdown :deep(h1),
.agent-message-markdown :deep(h2),
.agent-message-markdown :deep(h3) {
  margin: 0.4em 0 0.35em;
  font-weight: 600;
  line-height: 1.35;
}

.agent-message-markdown :deep(h1) {
  font-size: 18px;
}

.agent-message-markdown :deep(h2) {
  font-size: 16px;
}

.agent-message-markdown :deep(h3) {
  font-size: 14px;
}

.agent-message-markdown :deep(ul) {
  margin: 0.4em 0 0.7em;
  padding-left: 1.25em;
  list-style: disc;
}

.agent-message-markdown :deep(li) {
  margin: 0.2em 0;
}

.agent-message-markdown :deep(code) {
  font-family: 'Cascadia Code Variable', 'Fira Code', 'JetBrains Mono', ui-monospace, monospace;
  font-size: 12px;
  background: rgb(var(--color-surface));
  border-radius: 4px;
  padding: 1px 4px;
}

.agent-message-markdown :deep(pre) {
  margin: 0.45em 0 0.7em;
  overflow-x: auto;
  border-radius: 6px;
  border: 1px solid rgb(var(--color-border));
  background: rgb(var(--color-bg));
  padding: 10px 12px;
}

.agent-message-markdown :deep(pre code) {
  background: transparent;
  padding: 0;
}

.agent-message-markdown :deep(a) {
  color: rgb(var(--color-accent));
  text-decoration: underline;
  text-underline-offset: 2px;
}
</style>
