import { ref, watchEffect } from 'vue';
import type { Ref } from 'vue';
import { getItem, setItem } from '@/utils/storage';
import type { ThemeMode } from '@/types';

const STORAGE_KEY = 'theme';

/** 全局主题状态（单例） */
let globalModeRef: Ref<ThemeMode> | null = null;
let globalEffectiveTheme: Ref<'light' | 'dark'> | null = null;
let mediaQueryList: MediaQueryList | null = null;
let initialized = false;

function getSystemPreference(): 'light' | 'dark' {
  if (typeof window !== 'undefined' && window.matchMedia) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return 'light';
}

function applyTheme(theme: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-theme', theme);
}

/**
 * 初始化主题系统（在 main.ts 中调用，Vue app 创建前）
 * 只做初始 DOM 设置和媒体查询监听
 */
export function initTheme(): void {
  if (initialized) return;
  initialized = true;

  const savedMode = getItem<ThemeMode>(STORAGE_KEY, 'dark');
  const effectiveTheme = savedMode === 'system' ? getSystemPreference() : savedMode;

  applyTheme(effectiveTheme);

  // 监听系统主题变化（只对 system 模式生效）
  if (typeof window !== 'undefined' && window.matchMedia) {
    mediaQueryList = window.matchMedia('(prefers-color-scheme: dark)');
    mediaQueryList.addEventListener('change', (e: MediaQueryListEvent) => {
      const currentMode = globalModeRef?.value ?? savedMode;
      if (currentMode === 'system') {
        const newTheme = e.matches ? 'dark' : 'light';
        if (globalEffectiveTheme) {
          globalEffectiveTheme.value = newTheme;
        }
        applyTheme(newTheme);
      }
    });
  }
}

/**
 * 主题 composable（仅在 Vue setup 上下文中使用）
 */
export function useTheme() {
  // 确保已初始化
  if (!initialized) {
    initTheme();
  }

  const savedMode = getItem<ThemeMode>(STORAGE_KEY, 'dark');

  if (!globalModeRef) {
    globalModeRef = ref(savedMode);
    globalEffectiveTheme = ref(
      savedMode === 'system' ? getSystemPreference() : savedMode,
    );

    // watchEffect 只在有 Vue 上下文时生效
    try {
      watchEffect(() => {
        const newMode = globalModeRef!.value;
        if (newMode === 'system') {
          const sys = getSystemPreference();
          globalEffectiveTheme!.value = sys;
          applyTheme(sys);
        } else {
          globalEffectiveTheme!.value = newMode;
          applyTheme(newMode);
        }
        setItem(STORAGE_KEY, newMode);
      });
    } catch {
      // watchEffect 在非 Vue 上下文中可能失败，此时初始化已完成
    }
  }

  return {
    mode: globalModeRef!,
    effectiveTheme: globalEffectiveTheme!,
    setMode,
  };
}

/**
 * 设置主题模式（可从任何地方调用）
 */
export function setMode(newMode: ThemeMode): void {
  if (globalModeRef) {
    globalModeRef.value = newMode;
  } else {
    // 没有 Vue 上下文时直接应用
    const effective = newMode === 'system' ? getSystemPreference() : newMode;
    applyTheme(effective);
    setItem(STORAGE_KEY, newMode);
  }
}

/**
 * 获取当前有效主题（用于非 Vue 上下文中）
 */
export function getCurrentEffectiveTheme(): 'light' | 'dark' {
  if (globalEffectiveTheme) {
    return globalEffectiveTheme.value;
  }
  return getSystemPreference();
}
