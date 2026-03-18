<script setup lang="ts">
import type { ChartData } from '~/composables/useDashboard';

import { Bar, Line } from 'vue-chartjs';

import {
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineElement,
  PointElement,
  Title,
  Tooltip,
} from 'chart.js';

const props = defineProps<{ data: ChartData }>();

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
);

const barOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { labels: { color: '#9ca3af', font: { size: 11 } } },
    title: {
      display: true,
      text: '執行量',
      color: '#d1d5db',
      font: { size: 13 },
    },
  },
  scales: {
    x: {
      stacked: true,
      ticks: { color: '#6b7280' },
      grid: { color: '#1f2937' },
    },
    y: {
      stacked: true,
      ticks: { color: '#6b7280', stepSize: 1 },
      grid: { color: '#1f2937' },
    },
  },
};

const lineOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: false },
    title: {
      display: true,
      text: '成功率',
      color: '#d1d5db',
      font: { size: 13 },
    },
    tooltip: {
      callbacks: {
        label: (ctx: { parsed: { y: number } }) =>
          `${ctx.parsed.y.toFixed(1)}%`,
      },
    },
  },
  scales: {
    x: {
      ticks: { color: '#6b7280' },
      grid: { color: '#1f2937' },
    },
    y: {
      min: 0,
      max: 100,
      ticks: {
        color: '#6b7280',
        callback: (v: number) => `${v}%`,
      },
      grid: { color: '#1f2937' },
    },
  },
};

const barData = computed(() => ({
  labels: props.data.labels,
  datasets: [
    {
      label: '成功',
      data: props.data.success,
      backgroundColor: 'rgba(34, 197, 94, 0.7)',
    },
    {
      label: '失敗',
      data: props.data.failed,
      backgroundColor: 'rgba(239, 68, 68, 0.7)',
    },
    {
      label: '取消',
      data: props.data.cancelled,
      backgroundColor: 'rgba(107, 114, 128, 0.5)',
    },
  ],
}));

const lineData = computed(() => ({
  labels: props.data.labels,
  datasets: [
    {
      data: props.data.successRate,
      borderColor: '#60a5fa',
      backgroundColor: 'rgba(96, 165, 250, 0.1)',
      tension: 0.3,
      fill: true,
      pointRadius: 4,
      pointHoverRadius: 6,
    },
  ],
}));
</script>

<template>
  <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
    <div class="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
      <div class="h-64">
        <Bar :data="barData" :options="barOptions" />
      </div>
    </div>
    <div class="rounded-xl border border-gray-800 bg-gray-900/60 p-4">
      <div class="h-64">
        <Line :data="lineData" :options="lineOptions" />
      </div>
    </div>
  </div>
</template>
