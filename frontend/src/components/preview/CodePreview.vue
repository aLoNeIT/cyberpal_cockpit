<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import * as monaco from 'monaco-editor';

const props = defineProps<{
  filePath: string;
  content: string;
  language: string;
}>();

const editorContainer = ref<HTMLDivElement | null>(null);
let editor: monaco.editor.IStandaloneCodeEditor | null = null;

function detectTheme(): 'vs' | 'vs-dark' {
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'light' ? 'vs' : 'vs-dark';
}

function getCurrentEditorTheme(): string {
  return detectTheme();
}

onMounted(() => {
  if (!editorContainer.value) return;

  editor = monaco.editor.create(editorContainer.value, {
    value: props.content,
    language: props.language,
    theme: getCurrentEditorTheme(),
    readOnly: true,
    automaticLayout: true,
    minimap: { enabled: false },
    fontSize: 13,
    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    wordWrap: 'on',
    renderWhitespace: 'selection',
    tabSize: 2,
  });

  // 监听主题变化
  themeObserver = new MutationObserver(() => {
    if (editor) {
      monaco.editor.setTheme(getCurrentEditorTheme());
    }
  });

  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });
});

let themeObserver: MutationObserver | null = null;

onUnmounted(() => {
  editor?.dispose();
  themeObserver?.disconnect();
});

// 监听内容变化
watch(() => props.content, (newContent) => {
  if (editor && newContent !== editor.getValue()) {
    editor.setValue(newContent);
  }
});

// 监听语言变化
watch(() => props.language, (newLang) => {
  if (editor) {
    const model = editor.getModel();
    if (model) {
      monaco.editor.setModelLanguage(model, newLang);
    }
  }
});
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- 文件路径提示 -->
    <div class="flex items-center px-3 py-1 text-xs text-cockpit-muted border-b border-cockpit-border font-mono truncate bg-cockpit-bg/50 flex-shrink-0">
      <span class="mr-1">📄</span>
      <span class="truncate">{{ filePath }}</span>
    </div>

    <!-- Monaco 编辑器 -->
    <div ref="editorContainer" class="flex-1 min-h-0"></div>
  </div>
</template>

<style scoped>
</style>
