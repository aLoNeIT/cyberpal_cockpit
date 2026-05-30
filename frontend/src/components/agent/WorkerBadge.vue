<script setup lang="ts">
defineProps<{
  taskDescription?: string;
}>();
</script>

<template>
  <span
    class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded border border-dashed border-amber-500/60 bg-amber-500/10 text-amber-400 text-2xs font-medium select-none"
    :title="taskDescription || '由任务工具生成的 Worker Agent'"
  >
    <span class="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
    子任务
  </span>
</template>

<style scoped>
</style>
