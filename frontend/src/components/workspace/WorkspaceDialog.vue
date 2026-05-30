<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import * as api from '@/services/api';
import type { FsEntry } from '@/types';

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
  (e: 'confirm', name: string, mainPath: string, projectPaths: string[]): void;
}>();

// ==================== 步骤管理 ====================
type Step = 1 | 2;
const currentStep = ref<Step>(1);
const stepTitles: Record<Step, string> = { 1: '基本信息', 2: '项目目录' };

function goToStep(step: Step): void {
  currentStep.value = step;
  browserTarget.value = null;
  showBrowser.value = false;
  errorMsg.value = '';
}

// ==================== 步骤 1：基本信息 ====================
const nameInput = ref('');
const mainPath = ref('');

// ==================== 步骤 2：项目目录 ====================
interface ProjectEntry {
  id: number;
  path: string;
}
let nextProjectId = 0;
const projects = ref<ProjectEntry[]>([]);

function addProject(): void {
  projects.value.push({ id: nextProjectId++, path: '' });
}

function removeProject(id: number): void {
  projects.value = projects.value.filter((p) => p.id !== id);
}

// ==================== 侧滑文件浏览器 ====================
type BrowserTarget = 'main' | number; // 'main' = 主目录, number = 项目 ID
const browserTarget = ref<BrowserTarget | null>(null);
const showBrowser = ref(false);

const currentPath = ref('');
const entries = ref<FsEntry[]>([]);
const loadingDir = ref(false);
const selectedPath = ref('');

const drives = ref<string[]>([]);
const breadcrumbs = ref<{ name: string; path: string }[]>([]);

function openBrowser(target: BrowserTarget): void {
  browserTarget.value = target;
  showBrowser.value = true;
  // 首次打开加载主目录
  if (!currentPath.value) {
    loadHomeDir();
  }
}

function closeBrowser(): void {
  showBrowser.value = false;
  browserTarget.value = null;
}

function confirmBrowserSelection(): void {
  if (!selectedPath.value || browserTarget.value === null) return;

  if (browserTarget.value === 'main') {
    mainPath.value = selectedPath.value;
  } else {
    const project = projects.value.find((p) => p.id === browserTarget.value);
    if (project) {
      project.path = selectedPath.value;
    }
  }
  closeBrowser();
}

async function initDrives(): Promise<void> {
  try {
    const result = await api.fetchFsDrives();
    drives.value = result.drives;
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
    errorMsg.value = '无法加载主目录';
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
    const msg = err instanceof Error ? err.message : '浏览失败';
    errorMsg.value = msg;
    entries.value = [];
  } finally {
    loadingDir.value = false;
  }
}

function updateBreadcrumbs(dirPath: string): void {
  const normalized = dirPath.replace(/\\/g, '/');
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

function selectDrive(drive: string): void {
  browseDir(drive);
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

// ==================== 错误与提交 ====================
const errorMsg = ref('');

function validateStep1(): boolean {
  if (!nameInput.value.trim()) {
    errorMsg.value = '请输入工作区名称';
    return false;
  }
  if (!mainPath.value) {
    errorMsg.value = '请选择工作区目录';
    return false;
  }
  return true;
}

function handleNext(): void {
  errorMsg.value = '';
  if (validateStep1()) {
    goToStep(2);
  }
}

function handleConfirm(): void {
  errorMsg.value = '';
  const name = nameInput.value.trim();
  if (!name) {
    errorMsg.value = '请输入工作区名称';
    return;
  }
  if (!mainPath.value) {
    errorMsg.value = '工作区目录不能为空';
    return;
  }
  const projectPaths = projects.value.map((p) => p.path).filter(Boolean);
  emit('confirm', name, mainPath.value, projectPaths);
}

function handleCancel(): void {
  nameInput.value = '';
  mainPath.value = '';
  projects.value = [];
  currentPath.value = '';
  selectedPath.value = '';
  showBrowser.value = false;
  browserTarget.value = null;
  errorMsg.value = '';
  currentStep.value = 1;
  emit('close');
}

onMounted(() => {
  // 预加载，打开浏览器时更快
  loadHomeDir();
});

// ==================== 计算属性 ====================
const canGoBack = computed(() => currentStep.value === 2);

const mainPathDisplay = computed(() => {
  if (!mainPath.value) return '尚未选择';
  // 只显示最后两级
  const parts = mainPath.value.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length <= 2) return mainPath.value;
  return '.../' + parts.slice(-2).join('/');
});
</script>

<template>
  <div
    v-if="open"
    class="fixed inset-0 z-50 bg-black/50 flex items-center justify-center"
    @click.self="handleCancel"
  >
    <div
      class="bg-cockpit-panel border border-cockpit-border rounded-xl shadow-2xl overflow-hidden flex w-[880px]"
    >
      <!-- ========== 主内容区 ========== -->
      <div class="w-[520px] flex-shrink-0 flex flex-col">
        <!-- 标题栏 -->
        <div class="flex items-center justify-between px-5 py-3 border-b border-cockpit-border flex-shrink-0">
          <h2 class="text-base font-semibold text-cockpit-text tracking-tight">添加工作区</h2>
          <button
            class="text-cockpit-muted hover:text-cockpit-text transition-colors"
            @click="handleCancel"
          >
            ✕
          </button>
        </div>

        <!-- 步骤指示器 -->
        <div class="flex items-center px-5 py-3 border-b border-cockpit-border bg-cockpit-bg/30 flex-shrink-0">
          <div
            v-for="(title, step) in stepTitles"
            :key="step"
            class="flex items-center"
          >
            <!-- 步骤圆点 -->
            <div class="flex items-center gap-2">
              <div
                class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300"
                :class="currentStep >= Number(step)
                  ? 'bg-cockpit-accent text-white shadow-sm shadow-cockpit-accent/30'
                  : 'bg-cockpit-border/50 text-cockpit-muted'"
              >
                <span v-if="currentStep > Number(step)">✓</span>
                <span v-else>{{ step }}</span>
              </div>
              <span
                class="text-xs font-medium transition-colors"
                :class="currentStep >= Number(step) ? 'text-cockpit-text' : 'text-cockpit-muted'"
              >
                {{ title }}
              </span>
            </div>
            <!-- 连接线 -->
            <div
              v-if="Number(step) < 2"
              class="w-12 h-0.5 mx-2 rounded-full transition-colors duration-300"
              :class="currentStep > Number(step) ? 'bg-cockpit-accent' : 'bg-cockpit-border/50'"
            ></div>
          </div>
        </div>

        <!-- 步骤内容 -->
        <div class="flex-1 overflow-y-auto p-5 space-y-4">
          <p v-if="errorMsg" class="text-xs text-cockpit-danger bg-cockpit-danger/5 border border-cockpit-danger/20 rounded px-3 py-2">
            {{ errorMsg }}
          </p>

          <!-- ===== 步骤 1：基本信息 ===== -->
          <template v-if="currentStep === 1">
            <div>
              <label class="block text-xs text-cockpit-muted mb-1">工作区名称</label>
              <input
                v-model="nameInput"
                type="text"
                placeholder="例如：我的项目"
                class="w-full bg-cockpit-bg border border-cockpit-border rounded-lg px-3 py-2 text-sm text-cockpit-text placeholder-cockpit-muted focus:outline-none focus:border-cockpit-accent focus:ring-1 focus:ring-cockpit-accent/30 transition-all"
                @keydown.enter="handleNext"
              />
            </div>

            <div>
              <label class="block text-xs text-cockpit-muted mb-1">工作区目录</label>
              <div class="flex gap-2">
                <div
                  class="flex-1 flex items-center bg-cockpit-bg border border-cockpit-border rounded-lg px-3 py-2"
                  :class="mainPath ? 'border-cockpit-accent/30' : ''"
                >
                  <span v-if="mainPath" class="text-sm text-cockpit-text font-mono truncate" :title="mainPath">
                    {{ mainPathDisplay }}
                  </span>
                  <span v-else class="text-sm text-cockpit-muted">尚未选择</span>
                </div>
                <button
                  class="flex-shrink-0 px-4 py-2 text-xs rounded-lg bg-cockpit-accent/10 text-cockpit-accent hover:bg-cockpit-accent/20 border border-cockpit-accent/30 transition-all flex items-center gap-1"
                  @click="openBrowser('main')"
                >
                  📂 选择目录
                </button>
              </div>
              <p v-if="mainPath" class="text-2xs text-cockpit-muted mt-1 font-mono truncate">{{ mainPath }}</p>
            </div>
          </template>

          <!-- ===== 步骤 2：项目目录 ===== -->
          <template v-if="currentStep === 2">
            <div>
              <div class="flex items-center justify-between mb-2">
                <label class="text-xs text-cockpit-muted">附加代码项目（可选，可添加多个）</label>
                <button
                  class="text-xs text-cockpit-accent hover:text-cockpit-accent/80 transition-colors flex items-center gap-1"
                  @click="addProject"
                >
                  + 添加项目
                </button>
              </div>

              <div v-if="projects.length === 0" class="text-center py-8 text-xs text-cockpit-muted border border-dashed border-cockpit-border rounded-lg">
                暂未添加项目目录<br/>
                <span class="text-2xs">点击上方「+ 添加项目」来添加</span>
              </div>

              <div v-else class="space-y-2">
                <div
                  v-for="project in projects"
                  :key="project.id"
                  class="flex items-center gap-2 p-2 bg-cockpit-bg border border-cockpit-border rounded-lg group"
                >
                  <span class="text-xs text-cockpit-muted w-5 text-center flex-shrink-0">📁</span>
                  <div class="flex-1 min-w-0">
                    <div
                      v-if="project.path"
                      class="text-xs text-cockpit-text font-mono truncate"
                      :title="project.path"
                    >
                      {{ project.path }}
                    </div>
                    <div v-else class="text-xs text-cockpit-muted">未选择目录</div>
                  </div>
                  <button
                    class="flex-shrink-0 text-2xs px-2 py-1 rounded bg-cockpit-accent/10 text-cockpit-accent hover:bg-cockpit-accent/20 transition-colors"
                    @click="openBrowser(project.id)"
                  >
                    选择
                  </button>
                  <button
                    class="flex-shrink-0 text-cockpit-muted hover:text-cockpit-danger opacity-0 group-hover:opacity-100 transition-opacity text-xs px-1"
                    @click="removeProject(project.id)"
                    title="移除"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>

            <!-- 步骤 2 摘要 -->
            <div class="bg-cockpit-bg/50 border border-cockpit-border rounded-lg px-3 py-2.5 space-y-1">
              <div class="text-2xs text-cockpit-muted">工作区摘要</div>
              <div class="flex items-center gap-1.5 text-xs">
                <span class="text-cockpit-muted">名称：</span>
                <span class="text-cockpit-text font-medium">{{ nameInput || '（空）' }}</span>
              </div>
              <div class="flex items-center gap-1.5 text-xs">
                <span class="text-cockpit-muted">主目录：</span>
                <span class="text-cockpit-text font-mono truncate">{{ mainPathDisplay }}</span>
              </div>
              <div v-if="projects.filter(p => p.path).length > 0" class="flex items-start gap-1.5 text-xs">
                <span class="text-cockpit-muted flex-shrink-0">项目：</span>
                <span class="text-cockpit-text font-mono">
                  {{ projects.filter(p => p.path).length }} 个目录
                </span>
              </div>
            </div>
          </template>
        </div>

        <!-- 底部按钮 -->
        <div class="flex items-center justify-between px-5 py-3 border-t border-cockpit-border bg-cockpit-bg/30 flex-shrink-0">
          <!-- 左侧：返回按钮 -->
          <button
            v-if="canGoBack"
            class="px-3 py-1.5 text-xs rounded text-cockpit-muted hover:text-cockpit-text hover:bg-cockpit-border/30 transition-colors"
            @click="goToStep(1)"
          >
            ← 上一步
          </button>
          <div v-else></div>

          <!-- 右侧：操作按钮 -->
          <div class="flex gap-2">
            <button
              class="px-4 py-1.5 text-xs rounded-lg bg-cockpit-border/30 text-cockpit-text hover:bg-cockpit-border/50 transition-colors"
              @click="handleCancel"
            >
              取消
            </button>
            <button
              v-if="currentStep === 1"
              class="px-5 py-1.5 text-xs font-medium rounded-sm bg-cockpit-accent text-white hover:bg-cockpit-accent-hover transition-all duration-150"
              @click="handleNext"
            >
              下一步 →
            </button>
            <button
              v-if="currentStep === 2"
              class="px-5 py-1.5 text-xs font-medium rounded-sm bg-cockpit-accent text-white hover:bg-cockpit-accent-hover transition-all duration-150"
              @click="handleConfirm"
            >
              完成添加
            </button>
          </div>
        </div>
      </div>

      <!-- ========== 侧滑文件浏览器（360px 固定宽度，不隐藏） ========== -->
      <div class="w-[360px] border-l border-cockpit-border bg-cockpit-panel flex flex-col flex-shrink-0 overflow-hidden">
        <Transition name="browser-slide">
          <div v-if="showBrowser" class="flex flex-col h-full">
            <!-- 浏览器头部 -->
            <div class="flex items-center justify-between px-4 py-2.5 border-b border-cockpit-border flex-shrink-0">
              <span class="text-xs font-medium text-cockpit-text">
                {{ browserTarget === 'main' ? '选择工作区目录' : '选择项目目录' }}
              </span>
              <button
                class="text-cockpit-muted hover:text-cockpit-text text-sm"
                @click="closeBrowser"
              >
                ✕
              </button>
            </div>

            <!-- 当前选中路径 -->
            <div class="px-4 py-2 border-b border-cockpit-border/50 bg-cockpit-bg/30 flex-shrink-0">
              <span class="text-2xs text-cockpit-muted">当前选中</span>
              <div class="font-mono text-xs text-cockpit-accent truncate mt-0.5">
                {{ selectedPath || '...' }}
              </div>
            </div>

            <!-- 浏览器内容 -->
            <div class="flex-1 overflow-y-auto p-3 space-y-2">
              <!-- 驱动器 -->
              <div v-if="drives.length > 1" class="flex gap-1">
                <button
                  v-for="drive in drives"
                  :key="drive"
                  class="text-2xs px-2 py-0.5 rounded border font-mono transition-colors"
                  :class="currentPath.replace(/\\/g, '/').toLowerCase().startsWith(drive.replace(/\\/g, '/').toLowerCase())
                    ? 'bg-cockpit-accent/20 text-cockpit-accent border-cockpit-accent/30'
                    : 'bg-cockpit-bg text-cockpit-muted border-cockpit-border hover:text-cockpit-text'"
                  @click="selectDrive(drive)"
                >
                  {{ drive.replace('\\', '') }}
                </button>
              </div>

              <!-- 工具栏 -->
              <div class="flex items-center justify-between">
                <button
                  class="text-xs text-cockpit-accent hover:text-cockpit-accent/80"
                  @click="goUp"
                >
                  ↑ 上级目录
                </button>
              </div>

              <!-- 面包屑 -->
              <div class="flex items-center gap-1 flex-wrap text-2xs">
                <template v-for="(crumb, idx) in breadcrumbs" :key="crumb.path">
                  <span v-if="idx > 0" class="text-cockpit-muted">/</span>
                  <button
                    class="text-cockpit-accent hover:underline font-mono truncate max-w-[100px]"
                    @click="navigateToBreadcrumb(idx)"
                  >
                    {{ crumb.name }}
                  </button>
                </template>
              </div>

              <!-- 目录列表 -->
              <div class="bg-cockpit-bg border border-cockpit-border rounded-lg overflow-hidden">
                <div v-if="loadingDir" class="flex items-center justify-center py-10 text-xs text-cockpit-muted">
                  正在加载...
                </div>
                <div v-else-if="entries.length === 0" class="flex items-center justify-center py-10 text-xs text-cockpit-muted">
                  该目录下暂无子目录
                </div>
                <div v-else class="max-h-64 overflow-y-auto">
                  <!-- 选择当前目录 -->
                  <button
                    class="w-full flex items-center gap-2 px-3 py-2 text-xs text-left transition-colors border-b border-cockpit-border"
                    :class="selectedPath === currentPath
                      ? 'bg-cockpit-accent/20 text-cockpit-accent'
                      : 'text-cockpit-muted hover:bg-cockpit-accent/5'"
                    @click="selectedPath = currentPath"
                  >
                    <span>📂</span>
                    <span class="font-medium">使用当前目录</span>
                    <span v-if="selectedPath === currentPath" class="ml-auto text-cockpit-accent text-xs">✓</span>
                  </button>
                  <!-- 子目录 -->
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
                    <span v-if="selectedPath === entry.path" class="ml-auto text-cockpit-accent text-xs">✓</span>
                  </button>
                </div>
              </div>
              <p class="text-2xs text-cockpit-muted">双击进入 · 单击选中</p>
            </div>

            <!-- 浏览器底部：确认按钮 -->
            <div class="px-4 py-3 border-t border-cockpit-border flex-shrink-0">
              <button
                class="w-full py-2 text-xs font-medium rounded-sm bg-cockpit-accent text-white hover:bg-cockpit-accent-hover transition-all duration-150"
                @click="confirmBrowserSelection"
              >
                确认选择此目录
              </button>
            </div>
          </div>

          <!-- 未激活时的占位提示 -->
          <div v-else class="flex-1 flex items-center justify-center p-4">
            <div class="text-center">
              <div class="text-3xl mb-2">📂</div>
              <p class="text-xs text-cockpit-muted">点击左侧「选择目录」按钮</p>
              <p class="text-2xs text-cockpit-muted/60 mt-1">在此处浏览和选择目录</p>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<style scoped>
.browser-slide-enter-active,
.browser-slide-leave-active {
  transition: all 0.25s ease;
}
.browser-slide-enter-from,
.browser-slide-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
