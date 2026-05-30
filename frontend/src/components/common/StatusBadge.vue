<script setup lang="ts">
import type { AgentStatus } from '@/types';

const props = defineProps<{
  status: AgentStatus;
  isOrphaned?: boolean;
}>();

const statusMap: Record<AgentStatus, { label: string; bgClass: string; dotClass: string; animated: boolean }> = {
  running: {
    label: '运行中',
    bgClass: 'bg-cockpit-accent-subtle text-cockpit-accent',
    dotClass: 'bg-cockpit-accent',
    animated: true,
  },
  idle: {
    label: '空闲',
    bgClass: 'bg-cockpit-warning-subtle text-cockpit-warning',
    dotClass: 'bg-cockpit-warning',
    animated: false,
  },
  stopped: {
    label: '已停止',
    bgClass: 'bg-cockpit-muted/15 text-cockpit-muted',
    dotClass: 'bg-cockpit-muted',
    animated: false,
  },
  error: {
    label: '异常',
    bgClass: 'bg-cockpit-danger-subtle text-cockpit-danger',
    dotClass: 'bg-cockpit-danger',
    animated: true,
  },
  restarting: {
    label: '重启中',
    bgClass: 'bg-cockpit-accent-subtle text-cockpit-accent',
    dotClass: 'bg-cockpit-accent',
    animated: true,
  },
};

const orphanedStyle = {
  label: '游离态',
  bgClass: 'bg-cockpit-muted/10 text-cockpit-muted border border-dashed border-cockpit-muted/40',
  dotClass: 'bg-cockpit-muted/60 border border-dashed border-cockpit-muted',
};
</script>

<template>
  <span
    v-if="isOrphaned"
    class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-2xs font-medium"
    :class="orphanedStyle.bgClass"
    title="该 Agent 的父进程已终止"
  >
    <span class="w-1.5 h-1.5 rounded-full" :class="orphanedStyle.dotClass"></span>
    {{ orphanedStyle.label }}
  </span>
  <span
    v-else
    class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-2xs font-medium"
    :class="statusMap[status]?.bgClass || 'bg-cockpit-muted/15 text-cockpit-muted'"
    :title="statusMap[status]?.label || status"
  >
    <span
      class="w-1.5 h-1.5 rounded-full"
      :class="[
        statusMap[status]?.dotClass || 'bg-cockpit-muted',
        {
          'animate-pulse-ring': status === 'running' || status === 'restarting',
          'animate-blink-danger': status === 'error',
        },
      ]"
    ></span>
    {{ statusMap[status]?.label || status }}
  </span>
</template>

<style scoped>
/* 脉冲呼吸（running 态）— 复用 index.css 全局 keyframe，局部定制表现形式 */
.animate-pulse-ring {
  animation: pulse-ring 2s ease-out infinite;
}

/* 错误闪烁 */
.animate-blink-danger {
  animation: blink-danger 1s ease-in-out infinite;
}
</style>
