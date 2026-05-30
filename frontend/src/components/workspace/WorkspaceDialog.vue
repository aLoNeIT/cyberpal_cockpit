<script setup lang="ts">
import { ref, onMounted } from 'vue';
import * as api from '@/services/api';
import type { FsEntry } from '@/types';

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirm', name: string, path: string): void;
}>();

const nameInput = ref('');
const projectPath = ref('');
const errorMsg = ref('');

// 文件浏览器状态
const currentPath = ref('');
const entries = ref<FsEntry[]>([]);
const loadingDir = ref(false);
const selectedPath = ref('');

// 驱动器
const drives = ref<string[]>([]);
const homeDrive = ref('');

// 面包屑
const breadcrumbs = ref<{ name: string; path: string }[]>([]);

async function initDrives(): Promise<void> {
  try {
    const result = await api.fetchFsDrives();
    drives.value = result.drives;
    homeDrive.value = result.homeDrive;
  } catch { /* ignore */ }
}

async function loadHomeDir(): Promise<void> {
  try {
    await initDrives();
    const home = await api.fetchFsHome();
    currentPath.value = home.path;
    selectedPath.value = home.path;
    await browseDir(home.path);
  } catch {
    errorMsg.value = 'Failed to load home directory';
  }
}

async function browseDir(dirPath: string): Promise<void> {
  loadingDir.value = true;
  errorMsg.value = '';
  try {
    const result = await api.fetchFsBrowse(dirPath);
    currentPath.value = result.path;
    entries.value = result.entries;
    selectedPath.value = result.path;
    updateBreadcrumbs(result.path);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Browse failed';
    errorMsg.value = msg;
    entries.value = [];
  } finally {
    loadingDir.value = false;
  }
}

function selectDrive(drive: string): void {
  browseDir(drive);
}

function updateBreadcrumbs(dirPath: string): void {
  const normalized = dirPath.replace(/\\/g, '/');
  // Windows: "C:/Users/wangr" → ["C:", "Users", "wangr"]
  const match = normalized.match(/^([A-Za-z]:)\/?(.*)$/);
  if (match) {
    const drive = match[1] + '/';
    const parts = match[2].split('/').filter(Boolean);
    breadcrumbs.value = [
      { name: drive, path: drive },
      ...parts.map((part, idx) => ({
        name: part,
        path: drive + parts.slice(0, idx + 1).join('/'),
      })),
    ];
  } else {
    const parts = normalized.split('/').filter(Boolean);
    breadcrumbs.value = [
      { name: '/', path: '/' },
      ...parts.map((part, idx) => ({
        name: part,
        path: '/' + parts.slice(0, idx + 1).join('/'),
      })),
    ];
  }
}

function enterDir(entry: FsEntry): void {
  browseDir(entry.path);
}

function goUp(): void {
  const normalized = currentPath.value.replace(/\\/g, '/');
  const match = normalized.match(/^([A-Za-z]:)\/?(.*)$/);
  if (match) {
    const drive = match[1] + '/';
    const parts = match[2].split('/').filter(Boolean);
    if (parts.length === 0) return;
    parts.pop();
    browseDir(drive + parts.join('/'));
  } else {
    const parts = normalized.split('/').filter(Boolean);
    if (parts.length === 0) return;
    parts.pop();
    browseDir('/' + parts.join('/'));
  }
}

function navigateToBreadcrumb(idx: number): void {
  browseDir(breadcrumbs.value[idx].path);
}

function handleConfirm(): void {
  const name = nameInput.value.trim();
  if (!name) {
    errorMsg.value = 'Workspace name is required';
    return;
  }
  if (!selectedPath.value) {
    errorMsg.value = 'Please select a directory';
    return;
  }

  const base = selectedPath.value;
  const sub = projectPath.value.trim();
  const fullPath = sub
    ? `${base}${base.endsWith('/') || base.endsWith('\\') ? '' : '/'}${sub}`
    : base;

  emit('confirm', name, fullPath);
}

function handleCancel(): void {
  nameInput.value = '';
  projectPath.value = '';
  selectedPath.value = '';
  errorMsg.value = '';
  emit('close');
}

onMounted(() => {
  loadHomeDir();
});
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
    @click.self="handleCancel"
  >
    <div class="w-[560px] bg-cockpit-panel border border-cockpit-border rounded-xl shadow-2xl overflow-hidden">
      <!-- 标题栏 -->
      <div class="flex items-center justify-between px-5 py-3 border-b border-cockpit-border">
        <h2 class="text-base font-semibold text-cockpit-text tracking-tight">Add Workspace</h2>
        <button
          class="text-cockpit-muted hover:text-cockpit-text transition-colors"
          @click="handleCancel"
        >
          ✕
        </button>
      </div>

      <!-- 表单 -->
      <div class="p-5 space-y-3">
        <!-- 工作区名称 -->
        <div>
          <label class="block text-xs text-cockpit-muted mb-1">Workspace Name</label>
          <input
            v-model="nameInput"
            type="text"
            placeholder="e.g., my-project"
            class="w-full bg-cockpit-bg border border-cockpit-border rounded px-3 py-1.5 text-sm text-cockpit-text placeholder-cockpit-muted focus:outline-none focus:border-cockpit-accent"
          />
        </div>

        <!-- 路径选择 -->
        <div>
          <label class="block text-xs text-cockpit-muted mb-1">
            Workspace Path: <span class="font-mono text-cockpit-accent">{{ selectedPath || '...' }}</span>
          </label>
        </div>

        <!-- 项目子路径 -->
        <div>
          <label class="block text-xs text-cockpit-muted mb-1">Project Path (sub-directory, optional)</label>
          <div class="flex gap-1">
            <input
              v-model="projectPath"
              type="text"
              placeholder="/my-project"
              class="flex-1 bg-cockpit-bg border border-cockpit-border rounded px-3 py-1.5 text-sm text-cockpit-text placeholder-cockpit-muted focus:outline-none focus:border-cockpit-accent font-mono"
            />
            <button
              class="text-lg px-1 text-cockpit-muted hover:text-cockpit-text"
              title="Browse"
            >
              📁
            </button>
          </div>
        </div>

        <!-- 文件浏览器 -->
        <div>
          <div class="flex items-center justify-between mb-1.5">
            <span class="type-label text-cockpit-muted">File Browser</span>
            <button
              class="text-xs text-cockpit-accent hover:text-cockpit-accent/80 transition-colors"
              @click="goUp"
              :title="'Go up'"
            >
              ↑ Up
            </button>
          </div>

          <!-- 驱动器选择（横条） -->
          <div v-if="drives.length > 1" class="flex gap-1 mb-1.5">
            <button
              v-for="drive in drives"
              :key="drive"
              class="text-2xs px-2 py-0.5 rounded border font-mono transition-colors"
              :class="currentPath.replace(/\\/g, '/').toLowerCase().startsWith(drive.replace(/\\/g, '/').toLowerCase())
                ? 'bg-cockpit-accent/20 text-cockpit-accent border-cockpit-accent/30'
                : 'bg-cockpit-bg text-cockpit-muted border-cockpit-border hover:text-cockpit-text hover:border-cockpit-text/30'"
              @click="selectDrive(drive)"
            >
              {{ drive.replace('\\', '') }}
            </button>
          </div>

          <!-- 面包屑 -->
          <div class="flex items-center gap-1 mb-1.5 flex-wrap text-2xs">
            <template v-for="(crumb, idx) in breadcrumbs" :key="crumb.path">
              <span v-if="idx > 0" class="text-cockpit-muted">/</span>
              <button
                class="text-cockpit-accent hover:underline font-mono truncate max-w-[120px]"
                @click="navigateToBreadcrumb(idx)"
              >
                {{ crumb.name }}
              </button>
            </template>
          </div>

          <!-- 目录列表 -->
          <div class="bg-cockpit-bg border border-cockpit-border rounded-lg overflow-hidden">
            <div v-if="loadingDir" class="flex items-center justify-center py-8 text-xs text-cockpit-muted">
              Loading...
            </div>
            <div v-else-if="entries.length === 0" class="flex items-center justify-center py-8 text-xs text-cockpit-muted">
              No directories found
            </div>
            <div
              v-else
              class="max-h-48 overflow-y-auto"
            >
              <button
                v-for="entry in entries"
                :key="entry.path"
                class="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors hover:bg-cockpit-accent/10"
                :class="selectedPath === entry.path ? 'bg-cockpit-accent/15 text-cockpit-accent' : 'text-cockpit-text'"
                @click="selectedPath = entry.path"
                @dblclick="enterDir(entry)"
              >
                <span>📁</span>
                <span class="truncate">{{ entry.name }}</span>
              </button>
            </div>
          </div>
          <p class="text-2xs text-cockpit-muted mt-1">
            Click to select, double-click to enter directory
          </p>
        </div>

        <!-- 错误信息 -->
        <p v-if="errorMsg" class="text-xs text-cockpit-danger">{{ errorMsg }}</p>
      </div>

      <!-- 底部按钮 -->
      <div class="flex justify-end gap-2 px-5 py-3 border-t border-cockpit-border bg-cockpit-bg/30">
        <button
          class="px-4 py-1.5 text-xs rounded bg-cockpit-border/30 text-cockpit-text hover:bg-cockpit-border/50 transition-colors"
          @click="handleCancel"
        >
          Cancel
        </button>
        <button
          class="px-4 py-1.5 text-xs rounded bg-cockpit-accent text-white hover:bg-cockpit-accent/80 transition-colors"
          @click="handleConfirm"
        >
          Add
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>
