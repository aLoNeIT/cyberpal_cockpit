<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { Terminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import 'xterm/css/xterm.css';

const props = defineProps<{
  output: string;
}>();

const terminalEl = ref<HTMLDivElement | null>(null);
let terminal: Terminal | null = null;
let fitAddon: FitAddon | null = null;
const isLight = ref(false);

/** 亮色主题配置 */
const LIGHT_THEME = {
  background: '#ffffff',
  foreground: '#1a202c',
  cursor: '#3b82f6',
  selectionBackground: '#bfdbfe',
  black: '#6b7280',
  red: '#ef4444',
  green: '#10b981',
  yellow: '#f59e0b',
  blue: '#3b82f6',
  magenta: '#8b5cf6',
  cyan: '#06b6d4',
  white: '#9ca3af',
  brightBlack: '#4b5563',
  brightRed: '#f87171',
  brightGreen: '#34d399',
  brightYellow: '#fbbf24',
  brightBlue: '#60a5fa',
  brightMagenta: '#a78bfa',
  brightCyan: '#22d3ee',
  brightWhite: '#f3f4f6',
};

/** 暗色主题配置 */
const DARK_THEME = {
  background: '#0d1117',
  foreground: '#c9d1d9',
  cursor: '#58a6ff',
  selectionBackground: '#264f78',
  black: '#484f58',
  red: '#f85149',
  green: '#3fb950',
  yellow: '#d2991d',
  blue: '#58a6ff',
  magenta: '#bc8cff',
  cyan: '#39c5cf',
  white: '#b1bac4',
  brightBlack: '#6e7681',
  brightRed: '#ff7b72',
  brightGreen: '#56d364',
  brightYellow: '#e3b341',
  brightBlue: '#79c0ff',
  brightMagenta: '#d2a8ff',
  brightCyan: '#56d4dd',
  brightWhite: '#f0f6fc',
};

function detectTheme(): boolean {
  const attr = document.documentElement.getAttribute('data-theme');
  return attr === 'light';
}

function getXtermTheme() {
  return isLight.value ? LIGHT_THEME : DARK_THEME;
}

function scrollToBottom(): void {
  if (terminal) {
    terminal.scrollToBottom();
  }
}

defineExpose({ scrollToBottom });

onMounted(async () => {
  await nextTick();

  if (!terminalEl.value) return;

  isLight.value = detectTheme();

  terminal = new Terminal({
    cursorBlink: true,
    cursorStyle: 'bar',
    fontSize: 13,
    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', monospace",
    theme: getXtermTheme(),
    allowProposedApi: true,
    disableStdin: true,
    scrollback: 5000,
  });

  fitAddon = new FitAddon();
  const webLinksAddon = new WebLinksAddon();

  terminal.loadAddon(fitAddon);
  terminal.loadAddon(webLinksAddon);

  terminal.open(terminalEl.value);
  fitAddon.fit();

  // 如果已有输出，写入终端
  if (props.output) {
    terminal.write(props.output);
  }

  // 响应窗口大小变化
  const resizeObserver = new ResizeObserver(() => {
    if (fitAddon) {
      try {
        fitAddon.fit();
      } catch {
        // 忽略 fit 错误
      }
    }
  });

  resizeObserver.observe(terminalEl.value);

  // 监听主题变化
  const themeObserver = new MutationObserver(() => {
    const newIsLight = detectTheme();
    if (newIsLight !== isLight.value) {
      isLight.value = newIsLight;
      if (terminal) {
        terminal.options.theme = getXtermTheme();
      }
    }
  });

  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  });

  onUnmounted(() => {
    resizeObserver.disconnect();
    themeObserver.disconnect();
    terminal?.dispose();
  });
});

// 监听输出变化
watch(() => props.output, (newOutput, oldOutput) => {
  if (terminal && newOutput !== oldOutput) {
    // 仅写入增量部分
    const oldLen = oldOutput?.length || 0;
    const delta = newOutput.slice(oldLen);
    if (delta) {
      terminal.write(delta);
    }
  }
});
</script>

<template>
  <div ref="terminalEl" class="w-full h-full"></div>
</template>

<style scoped>
</style>
