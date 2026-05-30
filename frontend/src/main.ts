import { createApp } from 'vue';
import App from './App.vue';
import './index.css';
import { initTheme } from './composables/useTheme';

// 初始化主题（在 mount 前设置 data-theme 属性，确保首次渲染使用正确主题）
initTheme();

const app = createApp(App);
app.mount('#app');
