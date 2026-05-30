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
  <div class="h-full overflow-y-auto p-4">
    <div
      class="prose-container"
      v-html="displayContent"
    ></div>
    <div v-if="!displayContent" class="text-cockpit-muted text-sm text-center mt-4">
      等待 Markdown 输出...
    </div>
  </div>
</template>

<style scoped>
.prose-container {
  color: rgb(var(--color-text));
  font-size: 14px;
  line-height: 1.65;
  letter-spacing: -0.011em;
  word-wrap: break-word;
}
.prose-container :deep(h1) {
  font-size: 22px;
  font-weight: 700;
  letter-spacing: -0.019em;
  line-height: 1.3;
  margin-top: 1.25em;
  margin-bottom: 0.5em;
  color: rgb(var(--color-text));
}
.prose-container :deep(h2) {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.014em;
  line-height: 1.35;
  margin-top: 1.15em;
  margin-bottom: 0.45em;
  color: rgb(var(--color-text));
}
.prose-container :deep(h3) {
  font-size: 15px;
  font-weight: 600;
  letter-spacing: -0.011em;
  line-height: 1.4;
  margin-top: 1em;
  margin-bottom: 0.4em;
  color: rgb(var(--color-text));
}
.prose-container :deep(pre) {
  background: rgb(var(--color-bg));
  border: 1px solid rgb(var(--color-border));
  border-radius: 8px;
  padding: 14px 16px;
  overflow-x: auto;
  font-size: 13px;
  line-height: 1.55;
}
.prose-container :deep(code) {
  font-family: 'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace;
  font-size: 13px;
  background: rgb(var(--color-surface));
  padding: 2px 5px;
  border-radius: 4px;
  color: rgb(var(--color-text));
}
.prose-container :deep(pre code) {
  background: transparent;
  padding: 0;
  font-size: 13px;
}
.prose-container :deep(a) {
  color: rgb(var(--color-accent));
  text-decoration: underline;
  text-underline-offset: 2px;
}
.prose-container :deep(a:hover) {
  opacity: 0.85;
}
.prose-container :deep(blockquote) {
  border-left: 3px solid rgb(var(--color-accent));
  padding-left: 14px;
  color: rgb(var(--color-text-secondary));
  font-style: italic;
}
.prose-container :deep(p) {
  margin-bottom: 0.75em;
}
.prose-container :deep(ul),
.prose-container :deep(ol) {
  padding-left: 1.5em;
  margin-bottom: 0.75em;
}
.prose-container :deep(li) {
  margin-bottom: 0.25em;
}
.prose-container :deep(table) {
  border-collapse: collapse;
  width: 100%;
  font-size: 13px;
}
.prose-container :deep(th),
.prose-container :deep(td) {
  border: 1px solid rgb(var(--color-border));
  padding: 8px 14px;
  text-align: left;
}
.prose-container :deep(th) {
  background: rgb(var(--color-surface));
  font-weight: 600;
}
.prose-container :deep(hr) {
  border: none;
  border-top: 1px solid rgb(var(--color-border));
  margin: 1.25em 0;
}
</style>
