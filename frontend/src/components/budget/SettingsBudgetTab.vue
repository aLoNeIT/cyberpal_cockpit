<script setup lang="ts">
import { ref, watch } from 'vue';
import type { BudgetConfig, OverrunPolicy, AgentInfo } from '@/types';
import * as api from '@/services/api';

const props = defineProps<{
  config: BudgetConfig;
  agents: AgentInfo[];
}>();

const emit = defineEmits<{
  (e: 'updated', config: BudgetConfig): void;
}>();

const localConfig = ref<BudgetConfig>({ ...props.config });

watch(() => props.config, (val) => {
  localConfig.value = { ...val };
}, { deep: true });

const saving = ref(false);
const savedMsg = ref('');

const overrunPolicyOptions: { value: OverrunPolicy; label: string; desc: string }[] = [
  { value: 'reject_new', label: 'Reject New Agents', desc: 'Only block new agent creation' },
  { value: 'kill_oldest', label: 'Kill Oldest Agent', desc: 'Auto-terminate oldest agent to free budget' },
  { value: 'warn_only', label: 'Warn Only', desc: 'Show warnings but never block or kill' },
];

async function save(): Promise<void> {
  saving.value = true;
  try {
    const updated = await api.updateBudget(localConfig.value);
    emit('updated', updated);
    savedMsg.value = 'Budget settings saved ✓';
    setTimeout(() => { savedMsg.value = ''; }, 2000);
  } catch (err) {
    savedMsg.value = 'Save failed';
  } finally {
    saving.value = false;
  }
}

function toggleExcluded(agentId: string): void {
  const idx = localConfig.value.excludedAgentIds.indexOf(agentId);
  if (idx >= 0) {
    localConfig.value.excludedAgentIds.splice(idx, 1);
  } else {
    localConfig.value.excludedAgentIds.push(agentId);
  }
}
</script>

<template>
  <div class="space-y-4">
    <!-- Policy -->
    <div>
      <label class="text-xs font-semibold text-cockpit-text block mb-1">Overrun Policy</label>
      <select
        v-model="localConfig.overrunPolicy"
        class="w-full bg-cockpit-bg border border-cockpit-border rounded px-2 py-1.5 text-xs text-cockpit-text focus:outline-none focus:border-cockpit-accent"
      >
        <option v-for="opt in overrunPolicyOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
      <p class="text-2xs text-cockpit-muted mt-0.5">
        {{ overrunPolicyOptions.find(o => o.value === localConfig.overrunPolicy)?.desc }}
      </p>
    </div>

    <!-- Warning Threshold -->
    <div>
      <label class="text-xs font-semibold text-cockpit-text block mb-1">
        Warning Threshold: {{ Math.round(localConfig.warningThreshold * 100) }}%
      </label>
      <input
        type="range"
        :value="localConfig.warningThreshold * 100"
        min="50"
        max="95"
        step="5"
        class="w-full accent-cockpit-accent"
        @input="localConfig.warningThreshold = Number(($event.target as HTMLInputElement).value) / 100"
      />
      <div class="flex justify-between text-2xs text-cockpit-muted">
        <span>50%</span>
        <span>95%</span>
      </div>
    </div>

    <!-- Monthly Limit -->
    <div>
      <label class="text-xs font-semibold text-cockpit-text block mb-1">Monthly Token Limit (0 = unlimited)</label>
      <input
        v-model.number="localConfig.monthlyLimit"
        type="number"
        min="0"
        step="100000"
        class="w-full bg-cockpit-bg border border-cockpit-border rounded px-2 py-1.5 text-xs text-cockpit-text font-mono focus:outline-none focus:border-cockpit-accent"
      />
    </div>

    <!-- Excluded Agents -->
    <div>
      <label class="text-xs font-semibold text-cockpit-text block mb-1">Excluded Agents (not counted in budget)</label>
      <div v-if="agents.length === 0" class="text-2xs text-cockpit-muted italic">No agents running</div>
      <div v-else class="space-y-1 max-h-32 overflow-y-auto">
        <label
          v-for="a in agents"
          :key="a.id"
          class="flex items-center gap-2 text-xs text-cockpit-text cursor-pointer hover:bg-cockpit-border/20 rounded px-1 py-0.5"
        >
          <input
            type="checkbox"
            :checked="localConfig.excludedAgentIds.includes(a.id)"
            class="accent-cockpit-accent"
            @change="toggleExcluded(a.id)"
          />
          <span class="font-mono">{{ a.id.slice(0, 8) }}</span>
          <span class="text-cockpit-muted text-2xs truncate">{{ a.cwd }}</span>
        </label>
      </div>
    </div>

    <!-- Save -->
    <div class="flex items-center gap-2">
      <button
        class="px-4 py-1.5 text-xs font-medium rounded-sm bg-cockpit-accent text-white hover:bg-cockpit-accent-hover transition-colors duration-150 disabled:opacity-50"
        :disabled="saving"
        @click="save"
      >
        {{ saving ? 'Saving...' : 'Save Settings' }}
      </button>
      <span v-if="savedMsg" class="text-xs text-cockpit-success">{{ savedMsg }}</span>
    </div>
  </div>
</template>

<style scoped>
</style>
