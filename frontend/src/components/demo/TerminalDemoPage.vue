<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { fetchTerminalFileList } from '@/services/api';
import { usePtyTerminal } from '@/composables/usePtyTerminal';
import TerminalTreeNode from './TerminalTreeNode.vue';
import type { TerminalFileEntry, TerminalListResponse } from '@/types';

const terminalMountRef = ref<HTMLElement | null>(null);
const currentListing = ref<TerminalListResponse | null>(null);
const browsingPath = ref('');
const fileListError = ref<string | null>(null);
const loadingFiles = ref(false);
const expandedPaths = ref<Set<string>>(new Set());

let term: Terminal | null = null;
let fitAddon: FitAddon | null = null;
let resizeObserver: ResizeObserver | null = null;

const pty = usePtyTerminal({
  onData: (data) => {
    term?.write(data);
  },
  onCwd: (nextCwd) => {
    void loadFileList(nextCwd);
  },
});

const statusLabel = computed(() => {
  const labels: Record<typeof pty.status.value, string> = {
    idle: 'Idle',
    connecting: 'Connecting',
    running: 'Running',
    reconnecting: 'Reconnecting',
    exited: 'Exited',
    error: 'Error',
  };
  return labels[pty.status.value];
});

const statusClass = computed(() => {
  if (pty.status.value === 'running') return 'bg-cockpit-success-subtle text-cockpit-success';
  if (pty.status.value === 'connecting' || pty.status.value === 'reconnecting') return 'bg-cockpit-accent-subtle text-cockpit-accent';
  if (pty.status.value === 'error') return 'bg-cockpit-danger-subtle text-cockpit-danger';
  return 'bg-cockpit-muted/15 text-cockpit-muted';
});

const displayCwd = computed(() => pty.cwd.value || currentListing.value?.path || browsingPath.value || 'Starting...');

async function loadFileList(dirPath: string): Promise<void> {
  if (!dirPath) return;

  loadingFiles.value = true;
  fileListError.value = null;

  try {
    const listing = await fetchTerminalFileList(dirPath);
    currentListing.value = listing;
    browsingPath.value = listing.path;
    expandedPaths.value = new Set();
  } catch (err) {
    fileListError.value = err instanceof Error ? err.message : 'Failed to load directory';
  } finally {
    loadingFiles.value = false;
  }
}

function fitAndResize(): void {
  if (!fitAddon || !term) return;
  fitAddon.fit();
  pty.resize(term.cols, term.rows);
}

function handleTerminalInput(data: string): void {
  pty.sendInput(data);
}

function restartTerminal(): void {
  if (!term) return;
  term.write('\r\n[Restarting PTY session]\r\n');
  pty.restart({
    cwd: pty.cwd.value || currentListing.value?.path || browsingPath.value || undefined,
    cols: term.cols,
    rows: term.rows,
  });
}

function refreshFromTerminal(): void {
  pty.requestCwd();
  void loadFileList(pty.cwd.value || browsingPath.value);
}

async function toggleDirectory(entry: TerminalFileEntry): Promise<void> {
  if (entry.type !== 'directory') return;
  const next = new Set(expandedPaths.value);

  if (next.has(entry.path)) {
    next.delete(entry.path);
    expandedPaths.value = next;
    return;
  }

  next.add(entry.path);
  expandedPaths.value = next;

  if (!entry.children && entry.hasChildren) {
    try {
      const listing = await fetchTerminalFileList(entry.path);
      entry.children = listing.entries;
    } catch (err) {
      fileListError.value = err instanceof Error ? err.message : 'Failed to load directory';
    }
  }
}

function openParent(): void {
  if (!currentListing.value?.parentPath) return;
  void loadFileList(currentListing.value.parentPath);
}

onMounted(async () => {
  await nextTick();
  if (!terminalMountRef.value) return;

  term = new Terminal({
    cursorBlink: true,
    scrollback: 10000,
    fontFamily: 'Cascadia Code Variable, Fira Code, JetBrains Mono, ui-monospace, monospace',
    fontSize: 13,
    theme: {
      background: '#141828',
      foreground: '#C9D1D9',
      cursor: '#818CF8',
      selectionBackground: '#313959',
      black: '#0F1117',
      red: '#F87171',
      green: '#34D399',
      yellow: '#FBBF24',
      blue: '#818CF8',
      magenta: '#C084FC',
      cyan: '#22D3EE',
      white: '#C9D1D9',
    },
  });
  fitAddon = new FitAddon();

  term.loadAddon(fitAddon);
  term.loadAddon(new WebLinksAddon());
  term.open(terminalMountRef.value);
  term.onData(handleTerminalInput);

  fitAddon.fit();
  pty.start({ cwd: pty.cwd.value || undefined, cols: term.cols, rows: term.rows });
  void loadFileList(pty.cwd.value);

  resizeObserver = new ResizeObserver(() => {
    fitAndResize();
  });
  resizeObserver.observe(terminalMountRef.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
  pty.dispose();
  term?.dispose();
  term = null;
  fitAddon = null;
});
</script>

<template>
  <div class="h-screen w-screen overflow-hidden bg-cockpit-bg text-cockpit-text flex">
    <aside class="w-[280px] flex-shrink-0 bg-cockpit-panel border-r border-cockpit-border flex flex-col min-h-0">
      <div class="h-12 px-3 border-b border-cockpit-border flex items-center justify-between gap-2">
        <div class="min-w-0">
          <div class="type-label text-cockpit-muted">Current Directory</div>
          <div class="font-mono text-xs text-cockpit-text truncate" :title="browsingPath || displayCwd">
            {{ browsingPath || displayCwd }}
          </div>
        </div>
      </div>

      <div class="px-2 py-2 border-b border-cockpit-border flex items-center gap-2">
        <button
          class="px-2 py-1 rounded-sm text-xs text-cockpit-muted hover:bg-cockpit-surface-hover transition-colors"
          data-testid="refresh-terminal"
          title="Refresh"
          @click="refreshFromTerminal"
        >
          Refresh
        </button>
        <span v-if="loadingFiles" class="text-xs text-cockpit-muted">Loading</span>
      </div>

      <div class="flex-1 min-h-0 overflow-auto py-1">
        <button
          v-if="currentListing?.parentPath"
          class="w-full h-8 px-3 flex items-center gap-2 text-left text-xs font-mono hover:bg-cockpit-surface-hover"
          data-testid="entry-parent"
          @click="openParent"
        >
          <span class="text-cockpit-accent">../</span>
          <span class="truncate">..</span>
        </button>

        <TerminalTreeNode
          :entries="currentListing?.entries || []"
          :expanded-paths="expandedPaths"
          @toggle="toggleDirectory"
        />

        <div v-if="fileListError" class="px-3 py-2 text-xs text-cockpit-danger">
          {{ fileListError }}
        </div>
      </div>
    </aside>

    <main class="flex-1 min-w-0 min-h-0 flex flex-col">
      <header class="h-12 px-4 bg-cockpit-panel border-b border-cockpit-border flex items-center gap-3">
        <a class="text-cockpit-accent font-bold text-sm" href="/">CPC</a>
        <span class="text-cockpit-border">|</span>
        <span class="font-semibold text-sm">Xterm PTY Demo</span>
        <span class="font-mono text-xs text-cockpit-muted truncate flex-1" :title="displayCwd">
          {{ displayCwd }}
        </span>
        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium" :class="statusClass">
          {{ statusLabel }}
        </span>
        <button
          class="px-2.5 py-1 text-xs rounded-sm text-cockpit-muted hover:bg-cockpit-surface-hover transition-colors"
          data-testid="restart-terminal"
          title="Restart"
          @click="restartTerminal"
        >
          Restart
        </button>
        <button
          class="px-2.5 py-1 text-xs rounded-sm text-cockpit-danger hover:bg-cockpit-danger-subtle transition-colors"
          data-testid="stop-terminal"
          title="Stop"
          @click="pty.kill"
        >
          Stop
        </button>
      </header>

      <div class="flex-1 min-h-0 bg-cockpit-surface-sunken p-2">
        <div
          ref="terminalMountRef"
          data-testid="terminal-mount"
          class="h-full w-full overflow-hidden"
        ></div>
      </div>

      <div v-if="pty.error.value" class="px-4 py-2 bg-cockpit-danger-subtle text-cockpit-danger text-xs">
        {{ pty.error.value }}
      </div>
    </main>
  </div>
</template>

<style scoped></style>
