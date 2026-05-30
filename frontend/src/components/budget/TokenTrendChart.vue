<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch } from 'vue';
import { Chart, LineController, LineElement, PointElement, CategoryScale, LinearScale, Title, Tooltip, Legend, Filler } from 'chart.js';

Chart.register(LineController, LineElement, PointElement, CategoryScale, LinearScale, Title, Tooltip, Legend, Filler);

const props = defineProps<{
  label: string;
  days: number;
  data: { label: string; value: number }[];
  dailyLimit?: number;
}>();

const canvasRef = ref<HTMLCanvasElement | null>(null);
let chart: Chart<'line', number[], string> | null = null;

function createChart(): void {
  if (!canvasRef.value) return;
  const ctx = canvasRef.value.getContext('2d');
  if (!ctx) return;

  const datasets: any[] = [
    {
      label: props.label,
      data: props.data.map((d) => d.value),
      borderColor: '#3B82F6',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      fill: true,
      tension: 0.3,
      pointRadius: 2,
      pointBackgroundColor: '#3B82F6',
    },
  ];

  if (props.dailyLimit !== undefined && props.dailyLimit > 0) {
    datasets.push({
      label: '每日预算',
      data: Array(props.data.length).fill(props.dailyLimit),
      borderColor: '#EF4444',
      borderDash: [4, 4],
      borderWidth: 1.5,
      fill: false,
      pointRadius: 0,
    });
  }

  chart = new Chart<'line', number[], string>(ctx, {
    type: 'line',
    data: {
      labels: props.data.map((d) => d.label),
      datasets,
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: '#94A3B8',
            font: { size: 10 },
            boxWidth: 12,
            padding: 8,
          },
        },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${Number(ctx.parsed.y).toLocaleString()} tokens`,
          },
        },
      },
      scales: {
        x: {
          ticks: { color: '#94A3B8', font: { size: 9 } },
          grid: { color: 'rgba(148, 163, 184, 0.08)' },
        },
        y: {
          ticks: {
            color: '#94A3B8',
            font: { size: 9 },
            callback: (val) => Number(val).toLocaleString(),
          },
          grid: { color: 'rgba(148, 163, 184, 0.08)' },
        },
      },
    },
  });
}

function updateChart(): void {
  if (!chart) return;
  chart.data.labels = props.data.map((d) => d.label);
  chart.data.datasets[0].data = props.data.map((d) => d.value);
  if (chart.data.datasets[1] && props.dailyLimit !== undefined) {
    chart.data.datasets[1].data = Array(props.data.length).fill(props.dailyLimit);
  }
  chart.update('none');
}

onMounted(createChart);
onUnmounted(() => { if (chart) { chart.destroy(); chart = null; } });
watch(() => props.data, updateChart, { deep: true });
watch(() => props.dailyLimit, updateChart);
</script>

<template>
  <div class="relative h-48">
    <canvas ref="canvasRef"></canvas>
  </div>
</template>

<style scoped>
</style>
