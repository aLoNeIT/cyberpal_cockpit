<script setup lang="ts">
import { computed } from 'vue';
import AppLayout from './components/layout/AppLayout.vue';
import TerminalDemoPage from './components/demo/TerminalDemoPage.vue';

const isTerminalDemo = computed(() => window.location.pathname === '/demo/terminal');
</script>

<template>
  <TerminalDemoPage v-if="isTerminalDemo" />
  <AppLayout v-else />
</template>

<style scoped>
</style>
