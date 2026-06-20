<script setup lang="ts">
import type { ModelInfo } from '@/types';
import { getModelDisplayId, getModelSelector } from '@/utils/modelSelector';

const props = withDefaults(defineProps<{
  models: ModelInfo[];
  currentModel?: string;
  mode?: 'dropdown' | 'list';
}>(), {
  mode: 'dropdown',
});

const emit = defineEmits<{
  (e: 'select', modelId: string): void;
}>();
</script>

<template>
  <!-- Dropdown 模式 -->
  <select
    v-if="mode === 'dropdown'"
    class="w-full bg-cockpit-bg border border-cockpit-border rounded px-3 py-2 text-sm text-cockpit-text focus:outline-none focus:border-cockpit-accent"
    :value="currentModel || ''"
    @change="emit('select', ($event.target as HTMLSelectElement).value)"
  >
    <option value="" disabled>Select a model...</option>
    <option
      v-for="m in models"
      :key="getModelSelector(m)"
      :value="getModelSelector(m)"
      :selected="getModelSelector(m) === currentModel"
    >
      {{ m.name }} ({{ m.provider }}) [{{ getModelDisplayId(m) }}]
    </option>
  </select>

  <!-- List 模式 -->
  <div v-else class="space-y-0.5">
    <div
      v-for="m in models"
      :key="getModelSelector(m)"
      class="flex items-center justify-between px-3 py-1.5 rounded cursor-pointer transition-colors text-xs"
      :class="getModelSelector(m) === currentModel
        ? 'bg-cockpit-accent/15 text-cockpit-accent ring-1 ring-cockpit-accent/30'
        : 'text-cockpit-text hover:bg-cockpit-border/30'"
      @click="emit('select', getModelSelector(m))"
    >
      <div class="flex items-center gap-2">
        <span class="text-cockpit-muted text-2xs">{{ m.provider }}</span>
        <span class="font-medium">{{ m.name }}</span>
      </div>
      <span v-if="getModelSelector(m) === currentModel" class="text-cockpit-accent text-xs">✓ 当前</span>
      <span v-else-if="m.isDefault" class="text-cockpit-muted text-2xs">默认</span>
    </div>
  </div>
</template>

<style scoped>
</style>
