<script setup lang="ts">
import { ref } from 'vue';
import ProviderConfig from './ProviderConfig.vue';

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

type SettingsMenu = 'general' | 'provider' | 'budget' | 'about';

const activeMenu = ref<SettingsMenu>('provider');

const menuItems: { key: SettingsMenu; label: string; icon: string }[] = [
  { key: 'general', label: 'General', icon: '⚙' },
  { key: 'provider', label: 'Provider', icon: '🔌' },
  { key: 'budget', label: 'Budget', icon: '💰' },
  { key: 'about', label: 'About', icon: 'ℹ' },
];
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
    @click.self="emit('close')"
  >
    <div class="w-[900px] h-[600px] bg-cockpit-panel border border-cockpit-border rounded-xl shadow-2xl flex overflow-hidden">
      <!-- 左侧菜单 -->
      <div class="w-48 flex-shrink-0 border-r border-cockpit-border bg-cockpit-bg/50 p-3 space-y-1">
        <div class="text-xs font-semibold text-cockpit-muted uppercase tracking-wider mb-3 px-2">
          Settings
        </div>
        <button
          v-for="item in menuItems"
          :key="item.key"
          class="w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 transition-colors"
          :class="activeMenu === item.key
            ? 'bg-cockpit-accent/15 text-cockpit-accent font-medium'
            : 'text-cockpit-text hover:bg-cockpit-border/30'"
          @click="activeMenu = item.key"
        >
          <span class="text-base">{{ item.icon }}</span>
          <span>{{ item.label }}</span>
        </button>
      </div>

      <!-- 右侧内容区 -->
      <div class="flex-1 flex flex-col overflow-hidden">
        <!-- 标题栏 -->
        <div class="flex items-center justify-between px-6 py-3 border-b border-cockpit-border flex-shrink-0">
          <h2 class="text-sm font-semibold text-cockpit-text">
            {{ menuItems.find((m) => m.key === activeMenu)?.label || 'Settings' }}
          </h2>
          <button
            class="text-cockpit-muted hover:text-cockpit-text transition-colors text-lg leading-none"
            @click="emit('close')"
            title="Close settings"
          >
            ✕
          </button>
        </div>

        <!-- 内容区 -->
        <div class="flex-1 overflow-y-auto p-6">
          <!-- General -->
          <div v-if="activeMenu === 'general'" class="space-y-4">
            <h3 class="text-sm font-medium text-cockpit-text">General Settings</h3>
            <p class="text-xs text-cockpit-muted">
              General application settings will be available in a future update.
            </p>
          </div>

          <!-- Provider -->
          <ProviderConfig v-if="activeMenu === 'provider'" />

          <!-- Budget -->
          <div v-if="activeMenu === 'budget'" class="space-y-4">
            <h3 class="text-sm font-medium text-cockpit-text">Budget Settings</h3>
            <p class="text-xs text-cockpit-muted">
              Budget configuration is managed via the Budget dashboard panel. Click the 💰 button in the top bar.
            </p>
          </div>

          <!-- About -->
          <div v-if="activeMenu === 'about'" class="space-y-4">
            <h3 class="text-sm font-medium text-cockpit-text">About CyberPal Cockpit</h3>
            <div class="text-xs text-cockpit-muted space-y-2">
              <p>CyberPal Cockpit v0.1.0</p>
              <p>A multi-agent orchestration platform for AI-powered software development.</p>
              <div class="mt-4 pt-4 border-t border-cockpit-border">
                <p class="font-medium text-cockpit-text mb-1">Tech Stack</p>
                <ul class="list-disc list-inside space-y-0.5">
                  <li>Frontend: Vue 3 + TypeScript + Tailwind CSS + Vite</li>
                  <li>Backend: Express + TypeScript + WebSocket</li>
                  <li>Terminal: xterm.js</li>
                  <li>Editor: Monaco Editor</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>
