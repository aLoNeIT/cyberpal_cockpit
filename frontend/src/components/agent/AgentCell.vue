<script setup lang="ts">
import { ref, watch, inject } from 'vue';
import type { AgentInfo, ModelInfo } from '@/types';
import AgentTerminal from './AgentTerminal.vue';
import AgentMarkdown from './AgentMarkdown.vue';
import AgentInput from './AgentInput.vue';
import WorkerBadge from './WorkerBadge.vue';
import StatusBadge from '@/components/common/StatusBadge.vue';
import ModelSelector from './ModelSelector.vue';
import type { useAgents as UseAgentsType } from '@/composables/useAgents';
import type { useBudget as UseBudgetType } from '@/composables/useBudget';

const props = defineProps<{
  agent: AgentInfo;
  terminalOutput: string;
  markdownOutput: string;
}>();

const emit = defineEmits<{
  (e: 'send-input', input: string): void;
  (e: 'kill'): void;
}>();

const viewMode = ref<'terminal' | 'markdown'>('terminal');
const terminalRef = ref<InstanceType<typeof AgentTerminal> | null>(null);
const showModelPicker = ref(false);

// Inject composables
const agents = inject<ReturnType<UseAgentsType>>('useAgents');
const budget = inject<ReturnType<UseBudgetType>>('useBudget');

function onSendInput(input: string): void {
  emit('send-input', input);
}

function onKill(): void {
  emit('kill');
}

function toggleViewMode(): void {
  viewMode.value = viewMode.value === 'terminal' ? 'markdown' : 'terminal';
}

function toggleModelPicker(): void {
  showModelPicker.value = !showModelPicker.value;
}

async function onSelectModel(modelId: string): Promise<void> {
  showModelPicker.value = false;
  if (agents && modelId !== props.agent.model) {
    try {
      await agents.restartAgent(props.agent.id, modelId);
    } catch {
      // Error handled in composable
    }
  }
}

watch(() => props.terminalOutput, () => {
  if (viewMode.value === 'terminal' && terminalRef.value) {
    terminalRef.value.scrollToBottom();
  }
});

const displayName = props.agent.cwd.split(/[/\\]/).filter(Boolean).pop() || props.agent.cwd;
const isWorker = props.agent.parentId !== null;
const isRestarting = props.agent.status === 'restarting';

const availableModels = budget?.models.value || [];
</script>

<template>
  <div
    class="flex flex-col bg-cockpit-panel rounded-lg overflow-hidden min-h-0"
    :class="isWorker ? 'border border-dashed border-amber-500/50' : 'border border-cockpit-border'"
  >
    <!-- 头部 -->
    <div class="flex items-center justify-between px-3 py-2 border-b border-cockpit-border flex-shrink-0 bg-cockpit-bg/50">
      <div class="flex items-center gap-2 min-w-0">
        <span class="text-xs font-mono font-medium text-cockpit-text truncate" :title="agent.cwd">
          {{ displayName }}
        </span>
        <WorkerBadge v-if="isWorker" :task-description="agent.taskDescription" />
        <StatusBadge :status="agent.status" :is-orphaned="agent.isOrphaned" />
        <!-- Phase 3: 显示当前模型 -->
        <span v-if="agent.model" class="text-2xs text-cockpit-muted bg-cockpit-bg px-1.5 py-0.5 rounded font-mono" :title="agent.model">
          {{ agent.model }}
        </span>
      </div>
      <div class="flex items-center gap-1 flex-shrink-0">
        <!-- Phase 3: 切换模型按钮 -->
        <button
          v-if="agent.status === 'running' && availableModels.length > 1"
          class="text-2xs px-1.5 py-0.5 rounded text-cockpit-muted hover:text-cockpit-accent hover:bg-cockpit-accent/10 transition-colors"
          title="Switch model"
          @click="toggleModelPicker"
        >
          🔄
        </button>
        <button
          class="text-2xs px-1.5 py-0.5 rounded text-cockpit-muted hover:text-cockpit-text hover:bg-cockpit-border/30 transition-colors"
          @click="toggleViewMode"
          :title="viewMode === 'terminal' ? 'Switch to Markdown view' : 'Switch to Terminal view'"
        >
          {{ viewMode === 'terminal' ? 'MD' : '>_' }}
        </button>
        <button
          class="text-2xs px-1.5 py-0.5 rounded text-cockpit-muted hover:text-cockpit-danger hover:bg-cockpit-danger/10 transition-colors"
          @click="onKill"
          title="Stop agent"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Phase 3: 模型选择浮层 -->
    <div v-if="showModelPicker" class="absolute z-20 right-2 top-8 bg-cockpit-panel border border-cockpit-border rounded-lg shadow-xl p-2 w-56">
      <div class="type-overline mb-1.5">Select Model</div>
      <ModelSelector
        :models="availableModels"
        :current-model="agent.model"
        mode="list"
        @select="onSelectModel"
      />
    </div>

    <!-- Phase 3: 重启中遮罩 -->
    <div v-if="isRestarting" class="absolute inset-0 z-10 bg-cockpit-panel/80 flex items-center justify-center rounded-lg">
      <div class="flex flex-col items-center gap-2">
        <div class="w-5 h-5 border-2 border-cockpit-accent border-t-transparent rounded-full animate-spin"></div>
        <span class="text-sm text-cockpit-text">Switching model...</span>
      </div>
    </div>

    <!-- 内容区 -->
    <div class="flex-1 overflow-hidden min-h-0">
      <AgentTerminal
        v-if="viewMode === 'terminal'"
        ref="terminalRef"
        :output="terminalOutput"
      />
      <AgentMarkdown
        v-else
        :content="markdownOutput"
      />
    </div>

    <!-- 输入条 -->
    <div class="flex-shrink-0" v-if="agent.status === 'running'">
      <AgentInput
        :disabled="agent.status !== 'running'"
        @send="onSendInput"
      />
    </div>
  </div>
</template>

<style scoped>
</style>
