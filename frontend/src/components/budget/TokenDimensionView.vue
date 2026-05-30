<script setup lang="ts">
import { ref, computed } from 'vue';
import TokenBarChart from './TokenBarChart.vue';

interface ChartData { label: string; value: number; }

defineProps<{
  barData: ChartData[];
  workspaceData: ChartData[];
  dateData: ChartData[];
}>();
</script>

<template>
  <div>
    <div class="type-overline mb-2">
      Consumption Breakdown
    </div>

    <!-- 按 Agent（默认视图） -->
    <div class="space-y-1">
      <span class="text-2xs text-cockpit-muted">By Agent</span>
      <TokenBarChart :data="barData" />
    </div>

    <!-- 按项目（饼占位，Phase 3 mvp 用条形图代替） -->
    <div class="mt-3 space-y-1">
      <span class="text-2xs text-cockpit-muted">By Workspace</span>
      <div v-if="workspaceData.length > 0" class="space-y-1">
        <div
          v-for="d in workspaceData.slice(0, 5)"
          :key="d.label"
          class="flex items-center justify-between text-2xs"
        >
          <span class="text-cockpit-text font-mono">{{ d.label }}</span>
          <span class="text-cockpit-muted">{{ d.value.toLocaleString() }} tokens</span>
        </div>
      </div>
      <div v-else class="text-2xs text-cockpit-muted italic">No workspace data</div>
    </div>

    <!-- 按日期 -->
    <div class="mt-3 space-y-1">
      <span class="text-2xs text-cockpit-muted">By Date (7 days)</span>
      <div v-if="dateData.length > 0" class="space-y-1">
        <div
          v-for="d in dateData"
          :key="d.label"
          class="flex items-center justify-between text-2xs"
        >
          <span class="text-cockpit-text font-mono">{{ d.label }}</span>
          <span class="text-cockpit-muted">{{ d.value.toLocaleString() }} tokens</span>
        </div>
      </div>
      <div v-else class="text-2xs text-cockpit-muted italic">No daily data</div>
    </div>
  </div>
</template>

<style scoped>
</style>
