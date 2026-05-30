<script setup lang="ts">
import { ref } from 'vue';
import type { LayoutMode } from '@/composables/useLayout';
import type { ThemeMode } from '@/types';
import { useTheme, setMode as setThemeMode } from '@/composables/useTheme';

const props = defineProps<{
  mode: LayoutMode;
  rightPanelOpen: boolean;
  agentCount: number;
  connected: boolean;
  // Phase 2 新增
  conflictCount?: number;
  ircPanelOpen?: boolean;
  // Phase 3 新增
  budgetPanelOpen?: boolean;
  // Feature 1: Settings
  settingsOpen?: boolean;
}>();

const emit = defineEmits<{
  (e: 'toggle-mode'): void;
  (e: 'toggle-right-panel'): void;
  (e: 'add-agent'): void;
  // Phase 2 新增
  (e: 'toggle-irc'): void;
  // Phase 3 新增
  (e: 'toggle-budget'): void;
  // Feature 1: Settings
  (e: 'toggle-settings'): void;
}>();

// Feature 3: Theme
const theme = useTheme();
const showThemeMenu = ref(false);

const themeOptions: { mode: ThemeMode; label: string; icon: string }[] = [
  { mode: 'light', label: '浅色', icon: '☀️' },
  { mode: 'dark', label: '深色', icon: '🌙' },
  { mode: 'system', label: '跟随系统', icon: '🖥' },
];

function onSelectTheme(mode: ThemeMode): void {
  setThemeMode(mode);
  showThemeMenu.value = false;
}
</script>

<template>
  <header class="h-11 bg-cockpit-panel border-b border-cockpit-border flex items-center justify-between px-4 flex-shrink-0 select-none">
    <!-- 左侧 -->
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-2">
        <span class="text-cockpit-accent font-bold text-sm tracking-tight">CPC</span>
        <span class="text-cockpit-muted text-xs hidden sm:inline">赛博帕鲁驾驶舱</span>
      </div>
      <span class="text-cockpit-border">|</span>
      <span class="text-xs text-cockpit-muted">
        {{ agentCount }} 个 Agent
      </span>
    </div>

    <!-- 中间：连接状态 -->
    <div class="flex items-center gap-2">
      <span
        class="w-2 h-2 rounded-full"
        :class="connected ? 'bg-cockpit-success' : 'bg-cockpit-danger'"
      ></span>
      <span class="text-xs text-cockpit-muted">
        {{ connected ? '已连接' : '未连接' }}
      </span>
    </div>

    <!-- 右侧：操作按钮 -->
    <div class="flex items-center gap-1">
      <!-- Feature 3: 主题切换 -->
      <div class="relative">
        <button
          class="px-2.5 py-1 text-xs rounded-sm transition-colors duration-150"
          :class="showThemeMenu ? 'text-cockpit-accent bg-cockpit-accent-subtle' : 'text-cockpit-muted hover:bg-cockpit-surface-hover'"
          :title="'主题：' + themeOptions.find(t => t.mode === theme.mode.value)?.label"
          @click="showThemeMenu = !showThemeMenu"
        >
          {{ themeOptions.find(t => t.mode === theme.mode.value)?.icon || '🎨' }}
        </button>
        <!-- 主题下拉菜单 -->
        <div
          v-if="showThemeMenu"
          class="absolute right-0 top-9 bg-cockpit-panel border border-cockpit-border rounded-lg shadow-xl py-1.5 z-30 min-w-[130px]"
          @click.stop
        >
          <button
            v-for="opt in themeOptions"
            :key="opt.mode"
            class="w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors"
            :class="theme.mode.value === opt.mode ? 'text-cockpit-accent bg-cockpit-accent-subtle' : 'text-cockpit-text hover:bg-cockpit-surface-hover'"
            @click="onSelectTheme(opt.mode)"
          >
            <span>{{ opt.icon }}</span>
            <span>{{ opt.label }}</span>
            <span v-if="theme.mode.value === opt.mode" class="ml-auto text-cockpit-accent">✓</span>
          </button>
        </div>
      </div>

      <!-- Phase 2: IRC 面板按钮 -->
      <button
        class="relative px-2.5 py-1 text-xs rounded transition-colors"
        :class="ircPanelOpen ? 'text-cockpit-accent bg-cockpit-accent-subtle' : 'text-cockpit-muted hover:bg-cockpit-surface-hover'"
        title="切换 IRC 日志"
        @click="emit('toggle-irc')"
      >
        <svg class="w-3.5 h-3.5 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>

      <!-- Phase 3: Budget 仪表盘按钮 -->
      <button
        class="relative px-2.5 py-1 text-xs rounded transition-colors"
        :class="budgetPanelOpen ? 'text-cockpit-accent bg-cockpit-accent-subtle' : 'text-cockpit-muted hover:bg-cockpit-surface-hover'"
        title="切换预算仪表盘"
        @click="emit('toggle-budget')"
      >
        <span class="text-sm">💰</span>
      </button>

      <button
        class="px-2.5 py-1 text-xs rounded-sm bg-cockpit-accent-subtle text-cockpit-accent hover:bg-cockpit-accent/20 transition-colors duration-150"
        title="添加 Agent"
        @click="emit('add-agent')"
      >
        + Agent
      </button>
      <button
        class="px-2.5 py-1 text-xs rounded-sm text-cockpit-muted hover:bg-cockpit-surface-hover transition-colors duration-150"
        :title="mode === 'grid' ? '切换到单屏视图' : '切换到宫格视图'"
        @click="emit('toggle-mode')"
      >
        {{ mode === 'grid' ? '⊞ 宫格' : '⊟ 单屏' }}
      </button>
      <button
        class="px-2.5 py-1 text-xs rounded transition-colors"
        :class="rightPanelOpen ? 'text-cockpit-accent bg-cockpit-accent-subtle' : 'text-cockpit-muted hover:bg-cockpit-surface-hover'"
        title="切换预览面板"
        @click="emit('toggle-right-panel')"
      >
        ☰ 预览
      </button>

      <!-- Feature 1: Settings 按钮 -->
      <button
        class="px-2.5 py-1 text-xs rounded transition-colors"
        :class="settingsOpen ? 'text-cockpit-accent bg-cockpit-accent-subtle' : 'text-cockpit-muted hover:bg-cockpit-surface-hover'"
        title="设置"
        @click="emit('toggle-settings')"
      >
        ⚙
      </button>
    </div>
  </header>
</template>

<style scoped>
</style>
