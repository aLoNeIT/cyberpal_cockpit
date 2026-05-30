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
  <div class="border-t border-cockpit-border flex items-center gap-2 px-3 py-1.5 bg-cockpit-bg/50">
    <input
      v-model="inputText"
      :disabled="disabled"
      type="text"
      placeholder="Type input and press Enter..."
      class="flex-1 bg-transparent border-none outline-none text-xs text-cockpit-text placeholder-cockpit-muted font-mono"
      @keydown="handleKeydown"
    />
    <button
      :disabled="disabled || !inputText.trim()"
      class="text-xs px-2 py-0.5 rounded bg-cockpit-accent/20 text-cockpit-accent hover:bg-cockpit-accent/30 disabled:opacity-30 disabled:cursor-not-allowed transition-colors flex-shrink-0"
      @click="handleSend"
    >
      Send
    </button>
  </div>
</template>

<style scoped>
</style>
