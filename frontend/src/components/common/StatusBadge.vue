<script setup lang="ts">
import type { AgentStatus } from '@/types';

const props = defineProps<{
  status: AgentStatus;
  isOrphaned?: boolean;
}>();

const statusMap: Record<AgentStatus, { label: string; bgClass: string; dotClass: string }> = {
  running: {
    label: 'Running',
    bgClass: 'bg-cockpit-success/15 text-cockpit-success',
    dotClass: 'bg-cockpit-success',
  },
  stopped: {
    label: 'Stopped',
    bgClass: 'bg-cockpit-muted/15 text-cockpit-muted',
    dotClass: 'bg-cockpit-muted',
  },
  error: {
    label: 'Error',
    bgClass: 'bg-cockpit-danger/15 text-cockpit-danger',
    dotClass: 'bg-cockpit-danger',
  },
};

const orphanedStyle = {
  label: 'Orphaned',
  bgClass: 'bg-cockpit-muted/10 text-cockpit-muted border border-dashed border-cockpit-muted/40',
  dotClass: 'bg-cockpit-muted/60 border border-dashed border-cockpit-muted',
};
</script>

<template>
  <span
    v-if="isOrphaned"
    class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-2xs font-medium"
    :class="orphanedStyle.bgClass"
  >
    <span class="w-1.5 h-1.5 rounded-full" :class="orphanedStyle.dotClass"></span>
    {{ orphanedStyle.label }}
  </span>
  <span
    v-else
    class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-2xs font-medium"
    :class="statusMap[status].bgClass"
  >
    <span class="w-1.5 h-1.5 rounded-full" :class="statusMap[status].dotClass"></span>
    {{ statusMap[status].label }}
  </span>
</template>

<style scoped>
</style>
