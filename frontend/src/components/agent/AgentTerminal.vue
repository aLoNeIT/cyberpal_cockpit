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

/** 亮色主题配置 — 匹配设计系统 v1.0 */
const LIGHT_THEME = {
  background: '#EBEDF1',       /* color-surface-sunken */
  foreground: '#1A202C',       /* color-text */
  cursor: '#6366F1',           /* color-accent（Indigo 500） */
  selectionBackground: '#E0E7FF', /* color-accent-subtle */
  black: '#6B7C93',            /* color-text-secondary */
  red: '#EF4444',              /* color-danger */
  green: '#10B981',            /* color-success */
  yellow: '#F59E0B',           /* color-warning */
  blue: '#6366F1',             /* color-accent */
  magenta: '#8B5CF6',
  cyan: '#06B6D4',
  white: '#A0AAB9',            /* color-text-placeholder */
  brightBlack: '#4B5563',
  brightRed: '#F87171',
  brightGreen: '#34D399',
  brightYellow: '#FBBF24',
  brightBlue: '#818CF8',       /* color-accent（Indigo 400） */
  brightMagenta: '#A78BFA',
  brightCyan: '#22D3EE',
  brightWhite: '#F3F4F6',
};

/** 暗色主题配置 — 匹配设计系统 v1.0 */
const DARK_THEME = {
  background: '#141828',       /* color-surface-sunken dark */
  foreground: '#C9D1D9',       /* color-text dark */
  cursor: '#818CF8',           /* color-accent dark（Indigo 400） */
  selectionBackground: '#313959', /* color-accent-subtle dark */
  black: '#8B949E',            /* color-text-secondary dark */
  red: '#F87171',              /* color-danger dark */
  green: '#34D399',            /* color-success dark */
  yellow: '#FBBF24',           /* color-warning dark */
  blue: '#818CF8',             /* color-accent dark */
  magenta: '#A78BFA',
  cyan: '#22D3EE',
  white: '#5A6473',            /* color-text-placeholder dark */
  brightBlack: '#6E7681',
  brightRed: '#FF7B72',
  brightGreen: '#56D364',
  brightYellow: '#E3B341',
  brightBlue: '#A5B4FC',       /* color-accent-hover dark */
  brightMagenta: '#D2A8FF',
  brightCyan: '#56D4DD',
  brightWhite: '#F0F6FC',
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
    fontFamily: "'Cascadia Code Variable', 'Fira Code', 'JetBrains Mono', ui-monospace, monospace",
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
