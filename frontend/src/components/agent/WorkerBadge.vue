<script setup lang="ts">
defineProps<{
  taskDescription?: string;
}>();
</script>

<template>
  <span
    class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-dashed border-amber-500/60 bg-amber-500/10 text-amber-400 text-2xs font-medium select-none"
    :title="taskDescription || 'Worker agent spawned by task tool'"
  >
    <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
    worker
  </span>
</template>

<style scoped>
</style>
