<script setup lang="ts">
import { ref } from 'vue';

defineProps<{
  disabled: boolean;
}>();

const emit = defineEmits<{
  (e: 'send', input: string): void;
}>();

const inputText = ref('');

function handleSend(): void {
  const text = inputText.value.trim();
  if (!text) return;
  emit('send', text);
  inputText.value = '';
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}
</script>

<template>
  <div class="border-t border-cockpit-border flex items-center gap-2 px-3 py-2 bg-cockpit-bg/60">
    <input
      v-model="inputText"
      :disabled="disabled"
      type="text"
      placeholder="输入指令后按回车发送..."
      class="flex-1 bg-cockpit-surface-sunken border border-cockpit-border rounded-sm px-3 py-[7px] text-[13px] text-cockpit-text placeholder:text-cockpit-text-placeholder font-mono outline-none transition-colors duration-150 focus:border-cockpit-accent focus:shadow-[0_0_0_3px_rgba(var(--color-accent),0.25)] disabled:bg-cockpit-surface-sunken disabled:cursor-not-allowed"
      @keydown="handleKeydown"
    />
    <button
      :disabled="disabled || !inputText.trim()"
      class="text-[13px] font-medium px-3.5 py-[7px] rounded-sm bg-cockpit-accent text-white hover:bg-cockpit-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 flex-shrink-0"
      @click="handleSend"
    >
      发送
    </button>
  </div>
</template>

<style scoped>
</style>
