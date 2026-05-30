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
  { key: 'general', label: '通用', icon: '⚙' },
  { key: 'provider', label: '提供商', icon: '🔌' },
  { key: 'budget', label: '预算', icon: '💰' },
  { key: 'about', label: '关于', icon: 'ℹ' },
];
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
    @click.self="emit('close')"
  >
    <div class="w-[900px] h-[600px] bg-cockpit-panel border border-cockpit-border rounded-lg shadow-cockpit-lg flex overflow-hidden">
      <!-- 左侧菜单 -->
      <div class="w-48 flex-shrink-0 border-r border-cockpit-border bg-cockpit-bg/50 p-3 space-y-1">
        <div class="type-overline mb-3 px-2">
          设置
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
          <h2 class="text-base font-semibold text-cockpit-text tracking-tight">
            {{ menuItems.find((m) => m.key === activeMenu)?.label || '设置' }}
          </h2>
          <button
            class="text-cockpit-muted hover:text-cockpit-text transition-colors text-lg leading-none"
            @click="emit('close')"
            title="关闭设置"
          >
            ✕
          </button>
        </div>

        <!-- 内容区 -->
        <div class="flex-1 overflow-y-auto p-6">
          <!-- General -->
          <div v-if="activeMenu === 'general'" class="space-y-4">
            <h3 class="type-heading text-cockpit-text">通用设置</h3>
            <p class="text-xs text-cockpit-muted">
              通用应用设置将在后续版本中提供。
            </p>
          </div>

          <!-- Provider -->
          <ProviderConfig v-if="activeMenu === 'provider'" />

          <!-- Budget -->
          <div v-if="activeMenu === 'budget'" class="space-y-4">
            <h3 class="type-heading text-cockpit-text">预算设置</h3>
            <p class="text-xs text-cockpit-muted">
              预算配置通过预算仪表盘面板管理，点击顶部栏的 💰 按钮即可打开。
            </p>
          </div>

          <!-- About -->
          <div v-if="activeMenu === 'about'" class="space-y-4">
            <h3 class="type-heading text-cockpit-text">关于赛博帕鲁驾驶舱</h3>
            <div class="text-xs text-cockpit-muted space-y-2">
              <p>赛博帕鲁驾驶舱 v0.1.0</p>
              <p>面向 AI 驱动软件开发的多 Agent 协同平台。</p>
              <div class="mt-4 pt-4 border-t border-cockpit-border">
                <p class="font-medium text-cockpit-text mb-1">技术栈</p>
                <ul class="list-disc list-inside space-y-0.5">
                  <li>前端：Vue 3 + TypeScript + Tailwind CSS + Vite</li>
                  <li>后端：Express + TypeScript + WebSocket</li>
                  <li>终端：xterm.js</li>
                  <li>编辑器：Monaco Editor</li>
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
