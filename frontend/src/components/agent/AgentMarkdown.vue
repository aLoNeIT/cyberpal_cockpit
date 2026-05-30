<script setup lang="ts">
import { watch, ref } from 'vue';

const props = defineProps<{
  content: string;
}>();

const displayContent = ref('');

// 模拟流式渲染：逐步增加内容
let animationId: ReturnType<typeof requestAnimationFrame> | null = null;

watch(() => props.content, (newVal) => {
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
  // 直接显示全部内容（markstream-vue 库内部处理流式效果）
  displayContent.value = newVal;
});
</script>

<template>
  <div class="h-full overflow-y-auto p-3">
    <div
      class="prose-container"
      v-html="displayContent"
    ></div>
    <div v-if="!displayContent" class="text-cockpit-muted text-xs text-center mt-4">
      Waiting for Markdown output...
    </div>
  </div>
</template>

<style scoped>
.prose-container {
  color: rgb(var(--color-text));
  font-size: 13px;
  line-height: 1.6;
  word-wrap: break-word;
}
.prose-container :deep(pre) {
  background: rgb(var(--color-bg));
  border: 1px solid rgb(var(--color-border));
  border-radius: 6px;
  padding: 12px;
  overflow-x: auto;
  font-size: 12px;
}
.prose-container :deep(code) {
  font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace;
  font-size: 12px;
  background: rgb(var(--color-surface));
  padding: 2px 4px;
  border-radius: 3px;
  color: rgb(var(--color-text));
}
.prose-container :deep(pre code) {
  background: transparent;
  padding: 0;
}
.prose-container :deep(h1),
.prose-container :deep(h2),
.prose-container :deep(h3) {
  color: rgb(var(--color-text));
  margin-top: 1em;
  margin-bottom: 0.5em;
}
.prose-container :deep(a) {
  color: rgb(var(--color-accent));
}
.prose-container :deep(blockquote) {
  border-left: 3px solid rgb(var(--color-border));
  padding-left: 12px;
  color: rgb(var(--color-text-secondary));
}
.prose-container :deep(table) {
  border-collapse: collapse;
  width: 100%;
}
.prose-container :deep(th),
.prose-container :deep(td) {
  border: 1px solid rgb(var(--color-border));
  padding: 6px 12px;
  text-align: left;
}
.prose-container :deep(th) {
  background: rgb(var(--color-surface));
}
</style>
