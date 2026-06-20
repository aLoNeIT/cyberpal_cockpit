<script setup lang="ts">
import { nextTick, ref } from 'vue';

defineProps<{
  disabled: boolean;
}>();

const emit = defineEmits<{
  (e: 'send', input: string): void;
}>();

const inputText = ref('');
const editorRef = ref<HTMLTextAreaElement | null>(null);
const inputHint = ref('');

function handleSend(): void {
  const text = inputText.value.trim();
  if (!text) {
    inputHint.value = '请输入指令';
    editorRef.value?.focus();
    return;
  }
  inputHint.value = '';
  emit('send', text);
  inputText.value = '';
  nextTick(() => {
    resizeEditor();
    editorRef.value?.focus();
  });
}

function handleKeydown(e: KeyboardEvent): void {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSend();
  }
}

function resizeEditor(): void {
  inputHint.value = '';
  if (!editorRef.value) return;
  editorRef.value.style.height = 'auto';
  editorRef.value.style.height = `${Math.min(editorRef.value.scrollHeight, 112)}px`;
}
</script>

<template>
  <div class="border-t border-cockpit-border flex items-end gap-2 px-3 py-2 bg-cockpit-bg/60">
    <div class="flex-1 min-w-0">
      <textarea
        ref="editorRef"
        v-model="inputText"
        :disabled="disabled"
        rows="1"
        placeholder="输入指令，Enter 发送，Shift+Enter 换行"
        class="max-h-28 min-h-[34px] w-full resize-none overflow-y-auto bg-cockpit-surface-sunken border border-cockpit-border rounded-sm px-3 py-[7px] text-[13px] leading-5 text-cockpit-text placeholder:text-cockpit-text-placeholder font-mono outline-none transition-colors duration-150 focus:border-cockpit-accent focus:shadow-[0_0_0_3px_rgba(var(--color-accent),0.25)] disabled:bg-cockpit-surface-sunken disabled:cursor-not-allowed"
        @input="resizeEditor"
        @keydown="handleKeydown"
      ></textarea>
      <div
        v-if="inputHint"
        class="mt-1 text-[11px] leading-none text-cockpit-warning"
        role="status"
      >
        {{ inputHint }}
      </div>
    </div>
    <button
      :disabled="disabled || !inputText.trim()"
      class="min-h-[34px] text-[13px] font-medium px-3.5 py-[7px] rounded-sm bg-cockpit-accent text-white hover:bg-cockpit-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-150 flex-shrink-0"
      @click="handleSend"
    >
      发送
    </button>
  </div>
</template>

<style scoped>
</style>
