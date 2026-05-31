<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { Chart, BarController, BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend } from 'chart.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, Title, Tooltip, Legend);

const props = defineProps<{
  data: { label: string; value: number }[];
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let chart: Chart<'bar', number[], string> | null = null;

function createChart(): void {
  if (!canvasRef.value) return;

  const ctx = canvasRef.value.getContext('2d');
  if (!ctx) return;

  chart = new Chart<'bar', number[], string>(ctx, {
    type: 'bar',
    data: {
      labels: props.data.map((d) => d.label),
      datasets: [{
        label: 'Token',
        data: props.data.map((d) => d.value),
        backgroundColor: props.data.map((_, i) => {
          const alpha = 1 - (i / Math.max(props.data.length, 1)) * 0.6;
          return `rgba(59, 130, 246, ${alpha.toFixed(2)})`;
        }),
        borderRadius: 4,
        borderSkipped: false,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${(ctx.parsed.x ?? 0).toLocaleString()} tokens`,
          },
        },
      },
      scales: {
        x: {
          ticks: {
            color: '#94A3B8',
            font: { size: 10 },
            callback: (val) => Number(val).toLocaleString(),
          },
          grid: { color: 'rgba(148, 163, 184, 0.1)' },
        },
        y: {
          ticks: {
            color: '#E2E8F0',
            font: { size: 10 },
          },
          grid: { display: false },
        },
      },
    },
  });
}

function updateChart(): void {
  if (!chart) return;
  chart.data.labels = props.data.map((d) => d.label);
  chart.data.datasets[0].data = props.data.map((d) => d.value);
  chart.data.datasets[0].backgroundColor = props.data.map((_, i) => {
    const alpha = 1 - (i / Math.max(props.data.length, 1)) * 0.6;
    return `rgba(59, 130, 246, ${alpha.toFixed(2)})`;
  });
  chart.update('none');
}

onMounted(() => {
  createChart();
});

onUnmounted(() => {
  if (chart) {
    chart.destroy();
    chart = null;
  }
});

watch(() => props.data, updateChart, { deep: true });
</script>

<template>
  <div class="relative h-48">
    <canvas ref="canvasRef"></canvas>
  </div>
</template>

<style scoped>
</style>
