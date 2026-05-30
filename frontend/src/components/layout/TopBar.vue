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
  { mode: 'light', label: 'Light', icon: '☀️' },
  { mode: 'dark', label: 'Dark', icon: '🌙' },
  { mode: 'system', label: 'System', icon: '🖥' },
];

function onSelectTheme(mode: ThemeMode): void {
  setThemeMode(mode);
  showThemeMenu.value = false;
}
</script>

<template>
  <header class="h-10 bg-cockpit-panel border-b border-cockpit-border flex items-center justify-between px-4 flex-shrink-0 select-none">
    <!-- 左侧 -->
    <div class="flex items-center gap-3">
      <div class="flex items-center gap-2">
        <span class="text-cockpit-accent font-bold text-sm tracking-wide">CPC</span>
        <span class="text-cockpit-muted text-xs hidden sm:inline">CyberPal Cockpit</span>
      </div>
      <span class="text-cockpit-border">|</span>
      <span class="text-xs text-cockpit-muted">
        {{ agentCount }} agent{{ agentCount !== 1 ? 's' : '' }}
      </span>
    </div>

    <!-- 中间：连接状态 -->
    <div class="flex items-center gap-2">
      <span
        class="w-2 h-2 rounded-full"
        :class="connected ? 'bg-cockpit-success' : 'bg-cockpit-danger'"
      ></span>
      <span class="text-xs text-cockpit-muted">
        {{ connected ? 'Connected' : 'Disconnected' }}
      </span>
    </div>

    <!-- 右侧：操作按钮 -->
    <div class="flex items-center gap-1">
      <!-- Feature 3: 主题切换 -->
      <div class="relative">
        <button
          class="px-2.5 py-1 text-xs rounded transition-colors"
          :class="showThemeMenu ? 'text-cockpit-accent bg-cockpit-accent/10' : 'text-cockpit-muted hover:bg-cockpit-border/50'"
          :title="'Theme: ' + theme.mode.value"
          @click="showThemeMenu = !showThemeMenu"
        >
          {{ themeOptions.find(t => t.mode === theme.mode.value)?.icon || '🎨' }}
        </button>
        <!-- 主题下拉菜单 -->
        <div
          v-if="showThemeMenu"
          class="absolute right-0 top-8 bg-cockpit-panel border border-cockpit-border rounded-lg shadow-xl py-1 z-30 min-w-[120px]"
          @click.stop
        >
          <button
            v-for="opt in themeOptions"
            :key="opt.mode"
            class="w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition-colors"
            :class="theme.mode.value === opt.mode ? 'text-cockpit-accent bg-cockpit-accent/10' : 'text-cockpit-text hover:bg-cockpit-border/30'"
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
        :class="ircPanelOpen ? 'text-cockpit-accent bg-cockpit-accent/10' : 'text-cockpit-muted hover:bg-cockpit-border/50'"
        title="Toggle IRC Log"
        @click="emit('toggle-irc')"
      >
        <svg class="w-3.5 h-3.5 inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
      </button>

      <!-- Phase 3: Budget 仪表盘按钮 -->
      <button
        class="relative px-2.5 py-1 text-xs rounded transition-colors"
        :class="budgetPanelOpen ? 'text-cockpit-accent bg-cockpit-accent/10' : 'text-cockpit-muted hover:bg-cockpit-border/50'"
        title="Toggle Budget Dashboard"
        @click="emit('toggle-budget')"
      >
        <span class="text-sm">💰</span>
      </button>

      <button
        class="px-2.5 py-1 text-xs rounded bg-cockpit-accent/10 text-cockpit-accent hover:bg-cockpit-accent/20 transition-colors"
        title="Add Agent"
        @click="emit('add-agent')"
      >
        + Agent
      </button>
      <button
        class="px-2.5 py-1 text-xs rounded text-cockpit-muted hover:bg-cockpit-border/50 transition-colors"
        :title="mode === 'grid' ? 'Switch to Single View' : 'Switch to Grid View'"
        @click="emit('toggle-mode')"
      >
        {{ mode === 'grid' ? '⊞ Grid' : '⊟ Single' }}
      </button>
      <button
        class="px-2.5 py-1 text-xs rounded transition-colors"
        :class="rightPanelOpen ? 'text-cockpit-accent bg-cockpit-accent/10' : 'text-cockpit-muted hover:bg-cockpit-border/50'"
        title="Toggle Preview Panel"
        @click="emit('toggle-right-panel')"
      >
        ☰ Preview
      </button>

      <!-- Feature 1: Settings 按钮 -->
      <button
        class="px-2.5 py-1 text-xs rounded transition-colors"
        :class="settingsOpen ? 'text-cockpit-accent bg-cockpit-accent/10' : 'text-cockpit-muted hover:bg-cockpit-border/50'"
        title="Settings"
        @click="emit('toggle-settings')"
      >
        ⚙
      </button>
    </div>
  </header>
</template>

<style scoped>
</style>
