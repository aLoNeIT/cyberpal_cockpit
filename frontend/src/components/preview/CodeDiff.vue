<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  oldContent: string;
  newContent: string;
  language?: string;
  context?: number;
  outputFormat?: 'side-by-side' | 'line-by-line';
}>();

// 简单的行级 Diff 计算（MVP 阶段不引入复杂 diff 算法）
function computeDiff(oldStr: string, newStr: string): { oldLines: DiffLine[]; newLines: DiffLine[] } {
  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');

  const resultOld: DiffLine[] = [];
  const resultNew: DiffLine[] = [];

  // 使用 LCS 计算差异
  const lcsMatrix: number[][] = Array(oldLines.length + 1)
    .fill(null)
    .map(() => Array(newLines.length + 1).fill(0));

  for (let i = 1; i <= oldLines.length; i++) {
    for (let j = 1; j <= newLines.length; j++) {
      if (oldLines[i - 1] === newLines[j - 1]) {
        lcsMatrix[i][j] = lcsMatrix[i - 1][j - 1] + 1;
      } else {
        lcsMatrix[i][j] = Math.max(lcsMatrix[i - 1][j], lcsMatrix[i][j - 1]);
      }
    }
  }

  // 回溯
  let i = oldLines.length;
  let j = newLines.length;
  const diffResult: Array<{ type: 'equal' | 'remove' | 'add'; oldLine?: string; newLine?: string }> = [];

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diffResult.unshift({ type: 'equal', oldLine: oldLines[i - 1], newLine: newLines[j - 1] });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || lcsMatrix[i][j - 1] >= lcsMatrix[i - 1][j])) {
      diffResult.unshift({ type: 'add', newLine: newLines[j - 1] });
      j--;
    } else if (i > 0) {
      diffResult.unshift({ type: 'remove', oldLine: oldLines[i - 1] });
      i--;
    }
  }

  for (const entry of diffResult) {
    if (entry.type === 'equal') {
      resultOld.push({ type: 'equal', text: entry.oldLine || '' });
      resultNew.push({ type: 'equal', text: entry.newLine || '' });
    } else if (entry.type === 'remove') {
      resultOld.push({ type: 'remove', text: entry.oldLine || '' });
    } else if (entry.type === 'add') {
      resultNew.push({ type: 'add', text: entry.newLine || '' });
    }
  }

  return { oldLines: resultOld, newLines: resultNew };
}

interface DiffLine {
  type: 'equal' | 'add' | 'remove';
  text: string;
}

const diffResult = computed(() => computeDiff(props.oldContent, props.newContent));
const isSideBySide = computed(() => props.outputFormat !== 'line-by-line');

const lang = computed(() => props.language || 'plaintext');
</script>

<template>
  <div class="flex flex-col h-full">
    <!-- 头部 -->
    <div class="flex items-center px-3 py-1 text-xs text-cockpit-muted border-b border-cockpit-border bg-cockpit-bg/50 font-mono flex-shrink-0">
      <span class="mr-1">Δ</span>
      <span>Code Diff</span>
    </div>

    <!-- Side-by-side 模式 -->
    <div v-if="isSideBySide" class="flex-1 flex overflow-auto text-xs font-mono">
      <!-- 旧内容 -->
      <div class="flex-1 border-r border-cockpit-border overflow-auto">
        <div
          v-for="(line, idx) in diffResult.oldLines"
          :key="'old-' + idx"
          class="flex px-2 py-0"
          :class="{
            'bg-cockpit-danger/20 text-cockpit-danger': line.type === 'remove',
            'text-cockpit-text': line.type === 'equal',
          }"
        >
          <span class="text-cockpit-muted w-8 text-right mr-2 select-none flex-shrink-0">{{ idx + 1 }}</span>
          <span class="whitespace-pre-wrap break-all">{{ line.text || ' ' }}</span>
        </div>
      </div>
      <!-- 新内容 -->
      <div class="flex-1 overflow-auto">
        <div
          v-for="(line, idx) in diffResult.newLines"
          :key="'new-' + idx"
          class="flex px-2 py-0"
          :class="{
            'bg-cockpit-success/20 text-cockpit-success': line.type === 'add',
            'text-cockpit-text': line.type === 'equal',
          }"
        >
          <span class="text-cockpit-muted w-8 text-right mr-2 select-none flex-shrink-0">{{ idx + 1 }}</span>
          <span class="whitespace-pre-wrap break-all">{{ line.text || ' ' }}</span>
        </div>
      </div>
    </div>

    <!-- Line-by-line 模式 -->
    <div v-else class="flex-1 overflow-auto text-xs font-mono p-2">
      <div
        v-for="(line, idx) in diffResult.newLines"
        :key="'line-' + idx"
        class="flex px-2 py-0"
        :class="{
          'bg-cockpit-danger/20 text-cockpit-danger': line.type === 'remove',
          'bg-cockpit-success/20 text-cockpit-success': line.type === 'add',
          'text-cockpit-text': line.type === 'equal',
        }"
      >
        <span class="text-cockpit-muted w-6 text-right mr-2 select-none flex-shrink-0">
          {{ line.type === 'remove' ? '-' : line.type === 'add' ? '+' : ' ' }}
        </span>
        <span class="whitespace-pre-wrap break-all">{{ line.text || ' ' }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
</style>
