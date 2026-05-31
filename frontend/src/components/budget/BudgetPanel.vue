<script setup lang="ts">
import { computed, inject, ref } from 'vue';
import TokenBarChart from './TokenBarChart.vue';
import TokenTrendChart from './TokenTrendChart.vue';
import TokenDimensionView from './TokenDimensionView.vue';
import type { useBudget } from '@/composables/useBudget';

// inject 从父组件提供
const budget = inject<ReturnType<typeof useBudget> | null>('useBudget', null);
const panelWidth = ref(380);

// Phase 3: 趋势图天数切换
const trendDays = ref(7);

defineEmits<{
  (e: 'close'): void;
}>();

const agentData = computed(() => {
  if (!budget) return [];
  const byAgent = budget.getByAgent();
  return Array.from(byAgent.entries()).map(([id, val]) => ({
    label: id.slice(0, 8),
    value: val,
  })).slice(0, 10);
});

const totalTokens = computed(() => {
  if (!budget) return 0;
  return budget.budgetStatus.value.currentUsage;
});

const limitTokens = computed(() => {
  if (!budget) return 0;
  return budget.budgetStatus.value.monthlyLimit;
});

const pct = computed(() => {
  if (!budget) return 0;
  return Math.min(budget.budgetStatus.value.percentage * 100, 100);
});

const isUnlimited = computed(() => limitTokens.value === 0);

// Phase 3: 趋势数据准备
const trendData = computed(() => {
  const days = trendDays.value;
  const result: { label: string; value: number }[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const label = `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    result.push({ label, value: 0 });
  }
  return result;
});

const dailyLimit = computed(() => {
  if (!budget || limitTokens.value === 0) return undefined;
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return Math.round(limitTokens.value / daysInMonth);
});

const workspaceData = computed(() => {
  if (!budget) return [];
  const map = budget.getByWorkspace(new Map());
  return Array.from(map.entries()).map(([label, value]) => ({ label, value }));
});

const dateData = computed(() => {
  // 暂时用 agentData 模拟日期视图
  return agentData.value.slice(0, 7).map((d, i) => ({
    label: `Day ${i + 1}`,
    value: Math.round(d.value / Math.max(trendDays.value, 1)),
  }));
});

const progressColor = computed(() => {
  if (pct.value >= 100) return 'bg-red-500';
  if (pct.value >= 80) return 'bg-amber-500';
  if (pct.value >= 50) return 'bg-yellow-400';
  return 'bg-green-500';
});

const progressTextColor = computed(() => {
  if (pct.value >= 100) return 'text-red-500';
  if (pct.value >= 80) return 'text-amber-400';
  if (pct.value >= 50) return 'text-yellow-400';
  return 'text-green-400';
});

let resizeWidth = 380;
const resizing = ref(false);

function startResize(e: MouseEvent): void {
  resizing.value = true;
  resizeWidth = panelWidth.value;
  const startX = e.clientX;

  const onMove = (ev: MouseEvent) => {
    const newW = resizeWidth - (ev.clientX - startX);
    panelWidth.value = Math.max(320, Math.min(600, newW));
  };

  const onUp = () => {
    resizing.value = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}
</script>

<template>
  <div
    class="fixed right-0 top-10 bottom-0 z-30 bg-cockpit-panel border-l border-cockpit-border shadow-2xl flex flex-col overflow-hidden"
    :style="{ width: panelWidth + 'px' }"
  >
    <!-- Resize handle -->
    <div
      class="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-cockpit-accent/30 z-10"
      @mousedown="startResize"
    ></div>

    <!-- 头部 -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-cockpit-border flex-shrink-0">
      <div class="flex items-center gap-2">
        <span class="text-sm">💰</span>
        <span class="type-label text-cockpit-text">预算仪表盘</span>
      </div>
      <button class="text-cockpit-muted hover:text-cockpit-text text-sm" @click="$emit('close')">✕</button>
    </div>

    <div class="flex-1 overflow-y-auto p-3 space-y-4">
      <!-- 总览区 -->
      <div v-if="budget">
        <div class="text-center mb-2">
          <div class="text-3xl font-bold text-cockpit-text font-mono">
            {{ totalTokens.toLocaleString() }}
          </div>
          <div class="type-caption mt-0.5">本月 Token 总消耗</div>
        </div>

        <!-- 进度条 -->
        <div class="mb-3" v-if="!isUnlimited">
          <div class="flex items-center justify-between mb-1">
            <span class="text-2xs text-cockpit-muted">预算使用率</span>
            <span class="text-2xs font-mono" :class="progressTextColor">
              {{ pct.toFixed(1) }}%
            </span>
          </div>
          <div class="w-full h-2 bg-cockpit-bg rounded-full overflow-hidden">
            <div
              class="h-full rounded-full transition-all duration-500"
              :class="[progressColor, { 'animate-pulse': pct >= 100 }]"
              :style="{ width: Math.min(pct, 100) + '%' }"
            ></div>
          </div>
          <div class="flex items-center justify-between mt-1">
            <span class="text-2xs text-cockpit-muted">
              {{ limitTokens.toLocaleString() }} 限额
            </span>
            <span class="text-2xs text-cockpit-muted">
              {{ Math.max(0, limitTokens - totalTokens).toLocaleString() }} 剩余
            </span>
          </div>
        </div>
        <div v-else class="text-center text-2xs text-cockpit-muted mb-3">
          未设置预算限额
        </div>
      </div>

      <!-- Agent 排行 -->
      <div>
        <div class="type-overline mb-2">
          Agent Token 排行
        </div>
        <TokenBarChart :data="agentData" />
      </div>

      <!-- 维度视图 -->
      <TokenDimensionView
        :bar-data="agentData"
        :workspace-data="workspaceData"
        :date-data="dateData"
      />

      <!-- 趋势图 -->
      <div>
        <div class="flex items-center justify-between mb-2">
          <span class="type-overline">Token 趋势</span>
          <div class="flex gap-1">
            <button
              class="text-2xs px-1.5 py-0.5 rounded transition-colors"
              :class="trendDays === 7 ? 'bg-cockpit-accent/20 text-cockpit-accent' : 'text-cockpit-muted hover:text-cockpit-text'"
              @click="trendDays = 7"
            >7d</button>
            <button
              class="text-2xs px-1.5 py-0.5 rounded transition-colors"
              :class="trendDays === 30 ? 'bg-cockpit-accent/20 text-cockpit-accent' : 'text-cockpit-muted hover:text-cockpit-text'"
              @click="trendDays = 30"
            >30d</button>
          </div>
        </div>
        <TokenTrendChart
          label="Token 消耗"
          :days="trendDays"
          :data="trendData"
          :daily-limit="dailyLimit"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>
