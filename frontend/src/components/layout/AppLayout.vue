<script setup lang="ts">
import { ref, computed, onMounted, provide } from 'vue';
import TopBar from './TopBar.vue';
import LeftPanel from './LeftPanel.vue';
import CenterPanel from './CenterPanel.vue';
import RightPanel from './RightPanel.vue';
import ResizeHandle from '@/components/common/ResizeHandle.vue';
import AgentLauncher from '@/components/agent/AgentLauncher.vue';
import CodePreview from '@/components/preview/CodePreview.vue';
import IrcLogPanel from '@/components/irc/IrcLogPanel.vue';
import ConflictToast from '@/components/conflict/ConflictToast.vue';
import BudgetPanel from '@/components/budget/BudgetPanel.vue';
import SettingsPage from '@/components/settings/SettingsPage.vue';

import { useLayout } from '@/composables/useLayout';
import { useWorkspaces } from '@/composables/useWorkspaces';
import { useAgents } from '@/composables/useAgents';
import { useWebSocket } from '@/composables/useWebSocket';
import { useFilePreview } from '@/composables/useFilePreview';
import { useSessionTree } from '@/composables/useSessionTree';
import { useIrcLog } from '@/composables/useIrcLog';
import { useBudget } from '@/composables/useBudget';

import type { LeftPanelTab } from '@/composables/useLayout';
import type { AgentInfo } from '@/types';

// 初始化 composables
const layout = useLayout();
const workspaces = useWorkspaces();
const agents = useAgents();
const ws = useWebSocket();
const filePreview = useFilePreview();

// Phase 2: 新增 composables
const agentsMap = computed(() => agents.agents.value);
const sessionTree = useSessionTree(agentsMap);
const ircLog = useIrcLog();

// Phase 3: 新增 budget composable
const budget = useBudget();

// Feature 1: Settings
const settingsOpen = ref(false);

// 提供 composables 给子组件
provide('useLayout', layout);
provide('useWorkspaces', workspaces);
provide('useAgents', agents);
provide('useWebSocket', ws);
provide('useFilePreview', filePreview);
provide('useSessionTree', sessionTree);
provide('useIrcLog', ircLog);
provide('useBudget', budget);

// 对话框状态
const showLauncher = ref(false);

// 工作区选中状态
const selectedWorkspaceId = ref<string | null>(null);
const expandedWorkspaces = ref<Set<string>>(new Set());

onMounted(() => {
  workspaces.loadFromStorage();
  workspaces.syncFromServer();
  ws.connect();

  // Phase 1 WS 消息处理
  ws.onMessage('agent:stdout', (msg: { agentId: string; payload: { data: string } }) => {
    agents.appendOutput(msg.agentId, msg.payload.data);
  });

  ws.onMessage('agent:stderr', (msg: { agentId: string; payload: { data: string } }) => {
    agents.appendOutput(msg.agentId, msg.payload.data);
  });

  ws.onMessage('agent:status', (msg: { agentId: string; payload: { status: string; pid?: number } }) => {
    agents.updateStatus(msg.agentId, msg.payload.status as 'running' | 'stopped' | 'error');
  });

  ws.onMessage('agent:exit', (msg: { agentId: string; payload: { code: number | null } }) => {
    agents.updateStatus(msg.agentId, 'stopped');
  });

  ws.onMessage('file:changed', (msg: { payload: { filePath: string } }) => {
    if (filePreview.currentFile.value && filePreview.currentFile.value.path === msg.payload.filePath) {
      filePreview.openFile(msg.payload.filePath);
    }
  });

  // Phase 2: 新增 WS 消息路由
  ws.onMessage('agent:task-spawn', (msg: { payload: { parentId: string; childId: string; taskDescription: string; cwd: string } }) => {
    agents.handleTaskSpawn(msg.payload);
    // 子 agent 也需要订阅
    ws.subscribe(msg.payload.childId);
  });

  ws.onMessage('agent:task-result', (msg: { payload: { childId: string; result: string; tokenCost: number } }) => {
    agents.handleTaskResult(msg.payload);
  });

  ws.onMessage('agent:irc-dm', (msg: { payload: { from: string; to: string; message: string } }) => {
    ircLog.addMessage('dm', msg.payload.from, msg.payload.to, msg.payload.message);
    agents.handleIrc({ from: msg.payload.from, to: msg.payload.to, message: msg.payload.message, type: 'dm' });
  });

  ws.onMessage('agent:irc-broadcast', (msg: { payload: { from: string; message: string } }) => {
    ircLog.addMessage('broadcast', msg.payload.from, undefined, msg.payload.message);
    agents.handleIrc({ from: msg.payload.from, message: msg.payload.message, type: 'broadcast' });
  });

  ws.onMessage('agent:conflict', (msg: { payload: import('@/types').ConflictEvent }) => {
    agents.handleConflict(msg.payload);
  });

  // Phase 3: 新增 WS 消息路由
  ws.onMessage('agent:token-update', (msg: { payload: import('@/types').TokenUpdateEvent }) => {
    budget.onTokenUpdate(msg.payload);
  });

  ws.onMessage('budget:warning', (msg: { payload: import('@/types').BudgetStatus }) => {
    budget.onBudgetWarning(msg.payload);
  });

  // Phase 3: 初始化预算数据
  budget.init();
});

// 事件处理
async function onAddAgent(cwd: string, workspaceId?: string, model?: string): Promise<void> {
  try {
    const agent = await agents.createAgent(cwd, workspaceId, model);
    ws.subscribe(agent.id);
    showLauncher.value = false;
  } catch (err) {
    console.error('[AppLayout] Failed to create agent:', err);
    throw err;
  }
}

async function onKillAgent(id: string, cascade: boolean = true): Promise<void> {
  // Phase 2: 级联 kill — 检查是否有子 agent
  const agent = agents.agents.value.get(id);
  const hasChildren = agent && agent.childIds.length > 0;

  if (hasChildren && cascade) {
    // 获取后代数量用于确认提示
    const childrenCount = agent!.childIds.length;
    const confirmed = confirm(
      `This agent has ${childrenCount} child agent(s).\n\n` +
      `OK = Cascade kill (terminate all descendants)\n` +
      `Cancel = Kill self only (children become orphaned)`
    );
    if (!confirmed) {
      cascade = false;
    }
  }

  await agents.killAgent(id, cascade);
  ws.unsubscribe(id);

  // Phase 2: 级联 kill 子 agent — 同步清理子 agent 的订阅
  if (cascade && agent && agent.childIds.length > 0) {
    for (const childId of agent.childIds) {
      ws.unsubscribe(childId);
    }
  }
}

function onSelectWorkspace(id: string): void {
  selectedWorkspaceId.value = id;
  if (expandedWorkspaces.value.has(id)) {
    expandedWorkspaces.value.delete(id);
  } else {
    expandedWorkspaces.value.add(id);
    workspaces.getTree(id);
  }
}

async function onFileClick(filePath: string): Promise<void> {
  await filePreview.openFile(filePath);
}

async function onRefreshTree(): Promise<void> {
  if (selectedWorkspaceId.value) {
    await workspaces.getTree(selectedWorkspaceId.value);
  }
}

function onTabClick(agentId: string): void {
  layout.setActiveAgent(agentId);
}

function onTabClose(agentId: string): void {
  onKillAgent(agentId, true);
}

function onSendInput(agentId: string, input: string): void {
  agents.sendStdin(agentId, input);
}

// Phase 2: LeftPanel 事件处理
function onLeftPanelTabChange(tab: LeftPanelTab): void {
  layout.setLeftPanelTab(tab);
}

function onSessionNodeClick(agentId: string): void {
  layout.setActiveAgent(agentId);
  layout.setMode('single');
}

// Feature 2: 工作区创建
async function onAddWorkspace(name: string, path: string): Promise<void> {
  await workspaces.addWorkspace(name, path);
}
</script>

<template>
  <div class="h-screen flex flex-col bg-cockpit-bg overflow-hidden">
    <!-- 顶栏 -->
    <TopBar
      :mode="layout.mode.value"
      :right-panel-open="layout.rightPanelOpen.value"
      :agent-count="agents.agentList.value.length"
      :connected="ws.connected.value"
      :conflict-count="agents.activeConflicts.value.length"
      :irc-panel-open="layout.ircPanelOpen.value"
      :budget-panel-open="layout.budgetPanelOpen.value"
      :settings-open="settingsOpen"
      @toggle-mode="layout.toggleMode()"
      @toggle-right-panel="layout.toggleRightPanel()"
      @add-agent="showLauncher = true"
      @toggle-irc="layout.toggleIrcPanel()"
      @toggle-budget="layout.budgetPanelOpen = !layout.budgetPanelOpen"
      @toggle-settings="settingsOpen = !settingsOpen"
    />

    <!-- 冲突 Toast -->
    <ConflictToast
      :conflicts="agents.activeConflicts.value"
      @dismiss="(id: string) => agents.dismissConflict(id)"
    />

    <!-- 主体三栏 -->
    <div class="flex-1 flex overflow-hidden">
      <!-- 左栏 -->
      <div :style="{ width: layout.leftWidth.value + 'px' }" class="flex-shrink-0">
        <LeftPanel
          :workspaces="workspaces.workspaces.value"
          :selected-workspace-id="selectedWorkspaceId"
          :tree-data="selectedWorkspaceId ? workspaces.getCachedTree(selectedWorkspaceId) : []"
          :expanded="selectedWorkspaceId ? expandedWorkspaces.has(selectedWorkspaceId) : false"
          :left-panel-tab="layout.leftPanelTab.value"
          :session-tree-nodes="sessionTree.agentTree.value"
          @add-workspace="onAddWorkspace"
          @remove-workspace="(id: string) => workspaces.removeWorkspace(id)"
          @select-workspace="onSelectWorkspace"
          @toggle-tree="(id: string) => {
            if (expandedWorkspaces.has(id)) expandedWorkspaces.delete(id);
            else expandedWorkspaces.add(id);
          }"
          @file-click="onFileClick"
          @refresh-tree="onRefreshTree"
          @tab-change="onLeftPanelTabChange"
          @session-node-click="onSessionNodeClick"
        />
      </div>

      <!-- 拖拽手柄 -->
      <ResizeHandle direction="horizontal" :on-resize="(d: number) => layout.setLeftWidth(layout.leftWidth.value + d)" />

      <!-- 中栏 -->
      <div class="flex-1 overflow-hidden">
        <CenterPanel
          :mode="layout.mode.value"
          :agents="agents.agentList.value"
          :active-agent-id="layout.activeAgentId.value"
          :terminal-outputs="agents.terminalOutputs.value"
          :markdown-outputs="agents.markdownOutputs.value"
          @tab-click="onTabClick"
          @tab-close="onTabClose"
          @send-input="onSendInput"
          @kill-agent="(id: string) => onKillAgent(id, true)"
        />
      </div>

      <!-- 拖拽手柄：中栏 ↔ 右栏 -->
      <ResizeHandle
        v-if="layout.rightPanelOpen.value"
        direction="horizontal"
        :on-resize="(d: number) => layout.setRightWidth(layout.rightWidth.value - d)"
      />

      <!-- 右栏 -->
      <div class="flex-shrink-0" v-if="layout.rightPanelOpen.value">
        <RightPanel
          :open="layout.rightPanelOpen.value"
          :width="layout.rightWidth.value"
          @close="layout.toggleRightPanel()"
        >
          <CodePreview
            v-if="filePreview.currentFile.value"
            :file-path="filePreview.currentFile.value.path"
            :content="filePreview.currentFile.value.content"
            :language="filePreview.currentFile.value.language"
          />
          <div v-else class="flex items-center justify-center h-full text-cockpit-muted text-sm p-4 text-center">
            Click a file in the workspace tree to preview
          </div>
        </RightPanel>
      </div>
    </div>

    <!-- Agent 启动对话框 -->
    <AgentLauncher
      v-if="showLauncher"
      :workspaces="workspaces.workspaces.value"
      @confirm="onAddAgent"
      @cancel="showLauncher = false"
    />

    <!-- IRC 日志面板（浮动抽屉） -->
    <IrcLogPanel
      v-if="layout.ircPanelOpen.value"
      :messages="ircLog.filteredMessages.value"
      :filter="ircLog.filter.value"
      :available-agents="agents.agentList.value"
      @close="layout.toggleIrcPanel()"
      @set-filter="(f: string) => ircLog.setFilter(f)"
      @clear-filter="ircLog.clearFilter()"
    />

    <!-- Phase 3: Budget 仪表盘面板（浮动抽屉） -->
    <BudgetPanel
      v-if="layout.budgetPanelOpen.value"
      @close="layout.budgetPanelOpen = false"
    />

    <!-- Feature 1: Settings 页面 -->
    <SettingsPage
      :open="settingsOpen"
      @close="settingsOpen = false"
    />
  </div>
</template>

<style scoped>
</style>
