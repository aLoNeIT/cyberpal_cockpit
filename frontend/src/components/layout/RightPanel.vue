<script setup lang="ts">
defineProps<{
  open: boolean;
  width: number;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();
</script>

<template>
  <div
    v-if="open"
    class="h-full bg-cockpit-panel border-l border-cockpit-border flex flex-col transition-all duration-300"
    :style="{ width: width + 'px', minWidth: '300px' }"
  >
    <!-- 顶部标题栏 -->
    <div class="flex items-center justify-between px-3 py-1.5 border-b border-cockpit-border flex-shrink-0">
      <span class="type-label text-cockpit-muted">Preview</span>
      <button
        class="text-cockpit-muted hover:text-cockpit-text text-sm leading-none px-1"
        @click="emit('close')"
        title="Close preview panel"
      >
        ✕
      </button>
    </div>

    <!-- 内容区 -->
    <div class="flex-1 overflow-y-auto">
      <slot></slot>
    </div>
  </div>
</template>

<style scoped>
</style>
