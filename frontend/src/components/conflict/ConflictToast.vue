<script setup lang="ts">
import { ref } from 'vue';
import type { ConflictNotification } from '@/composables/useAgents';

defineProps<{
  conflicts: ConflictNotification[];
}>();

const emit = defineEmits<{
  (e: 'dismiss', id: string): void;
}>();

const expanded = ref(false);

function agentLabel(agentId: string): string {
  return agentId.slice(0, 8);
}
</script>

<template>
  <div class="relative" v-if="conflicts.length > 0">
    <!-- 角标 -->
    <div
      class="fixed top-16 right-4 z-40 flex items-center gap-1.5 px-2.5 py-1.5 bg-cockpit-danger/20 border border-cockpit-danger/40 rounded-lg cursor-pointer hover:bg-cockpit-danger/30 transition-colors shadow-lg"
      @click="expanded = !expanded"
    >
      <span class="w-2 h-2 rounded-full bg-cockpit-danger animate-pulse"></span>
      <span class="text-xs font-medium text-cockpit-danger">{{ conflicts.length }}</span>
      <span class="text-xs text-cockpit-danger/70">conflict{{ conflicts.length > 1 ? 's' : '' }}</span>
    </div>

    <!-- Toast 列表 -->
    <Transition name="toast">
      <div
        v-if="expanded"
        class="fixed top-28 right-4 z-50 bg-cockpit-panel border border-cockpit-border rounded-lg shadow-2xl w-80 max-h-96 overflow-y-auto"
      >
        <div class="flex items-center justify-between px-3 py-2 border-b border-cockpit-border">
          <span class="text-xs font-semibold text-cockpit-text">Conflict Alerts</span>
          <button
            class="text-cockpit-muted hover:text-cockpit-text text-xs"
            @click="expanded = false"
          >
            ✕
          </button>
        </div>

        <div class="divide-y divide-cockpit-border">
          <div
            v-for="c in conflicts.slice(0, 5)"
            :key="c.id"
            class="px-3 py-2 hover:bg-cockpit-bg/50 transition-colors"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="flex-1 min-w-0">
                <div class="text-[10px] text-cockpit-muted font-mono truncate" :title="c.event.filePath">
                  {{ c.event.filePath.split('/').pop() || c.event.filePath }}
                </div>
                <div class="text-xs text-cockpit-text mt-0.5">
                  <span class="text-cockpit-accent">{{ agentLabel(c.event.agentA) }}</span>
                  <span class="text-cockpit-muted"> ({{ c.event.operationA }})</span>
                  <span class="text-cockpit-muted mx-1">vs</span>
                  <span class="text-cockpit-danger">{{ agentLabel(c.event.agentB) }}</span>
                  <span class="text-cockpit-muted"> ({{ c.event.operationB }})</span>
                </div>
                <div class="text-[10px] text-cockpit-muted mt-0.5">
                  {{ new Date(c.event.detectedAt).toLocaleTimeString() }}
                </div>
              </div>
              <button
                class="text-cockpit-muted hover:text-cockpit-text text-xs flex-shrink-0"
                @click="emit('dismiss', c.id)"
                title="Dismiss"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        <div v-if="conflicts.length > 5" class="px-3 py-2 text-[10px] text-cockpit-muted text-center border-t border-cockpit-border">
          +{{ conflicts.length - 5 }} more conflicts
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.2s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
