<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';

const props = defineProps<{
  direction: 'horizontal' | 'vertical';
  onResize: (delta: number) => void;
}>();

const handleRef = ref<HTMLDivElement | null>(null);
let dragging = false;
let startX = 0;
let startY = 0;

function onMouseDown(e: MouseEvent): void {
  dragging = true;
  startX = e.clientX;
  startY = e.clientY;
  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
  document.body.style.cursor = props.direction === 'horizontal' ? 'col-resize' : 'row-resize';
  document.body.style.userSelect = 'none';
}

function onMouseMove(e: MouseEvent): void {
  if (!dragging) return;
  const dx = e.clientX - startX;
  const dy = e.clientY - startY;
  const delta = props.direction === 'horizontal' ? dx : dy;
  if (delta !== 0) {
    startX = e.clientX;
    startY = e.clientY;
    props.onResize(delta);
  }
}

function onMouseUp(): void {
  dragging = false;
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
}

onUnmounted(() => {
  document.removeEventListener('mousemove', onMouseMove);
  document.removeEventListener('mouseup', onMouseUp);
});
</script>

<template>
  <div
    ref="handleRef"
    class="flex-shrink-0 bg-cockpit-border hover:bg-cockpit-accent transition-colors duration-150 cursor-col-resize group"
    :class="
      direction === 'horizontal'
        ? 'w-1 h-full cursor-col-resize'
        : 'h-1 w-full cursor-row-resize'
    "
    @mousedown="onMouseDown"
  >
    <div
      class="w-1 h-8 rounded-full bg-transparent group-hover:bg-cockpit-accent absolute top-1/2 -translate-y-1/2 -translate-x-1/2 left-1/2"
      v-if="direction === 'horizontal'"
    ></div>
  </div>
</template>

<style scoped>
</style>
