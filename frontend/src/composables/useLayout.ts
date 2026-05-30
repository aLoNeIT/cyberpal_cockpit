import { ref } from 'vue';
import type { Ref } from 'vue';
import { getItem, setItem } from '@/utils/storage';
import { STORAGE_KEYS, LAYOUT } from '@/utils/constants';

export type LayoutMode = 'grid' | 'single';
export type LeftPanelTab = 'workspace' | 'session';

export function useLayout() {
  const savedLayout = getItem<{ mode: LayoutMode; rightPanelOpen: boolean; leftWidth: number; rightWidth: number }>(
    STORAGE_KEYS.layout,
    {
      mode: 'grid',
      rightPanelOpen: true,
      leftWidth: LAYOUT.leftPanel.defaultWidth,
      rightWidth: LAYOUT.rightPanel.defaultWidth,
    },
  );

  const mode: Ref<LayoutMode> = ref(savedLayout.mode);
  const rightPanelOpen: Ref<boolean> = ref(savedLayout.rightPanelOpen);
  const activeAgentId: Ref<string | null> = ref(null);
  const leftWidth: Ref<number> = ref(savedLayout.leftWidth);
  const rightWidth: Ref<number> = ref(savedLayout.rightWidth);

  // Phase 2: 新增状态
  const ircPanelOpen: Ref<boolean> = ref(false);
  const leftPanelTab: Ref<LeftPanelTab> = ref('workspace');

  // Phase 3: 新增状态
  const budgetPanelOpen: Ref<boolean> = ref(false);

  function persist() {
    setItem(STORAGE_KEYS.layout, {
      mode: mode.value,
      rightPanelOpen: rightPanelOpen.value,
      leftWidth: leftWidth.value,
      rightWidth: rightWidth.value,
    });
  }

  function toggleMode(): void {
    mode.value = mode.value === 'grid' ? 'single' : 'grid';
    persist();
  }

  function setMode(newMode: LayoutMode): void {
    mode.value = newMode;
    persist();
  }

  function toggleRightPanel(): void {
    rightPanelOpen.value = !rightPanelOpen.value;
    persist();
  }

  function setActiveAgent(id: string): void {
    activeAgentId.value = id;
  }

  function setLeftWidth(width: number): void {
    leftWidth.value = Math.max(LAYOUT.leftPanel.minWidth, Math.min(LAYOUT.leftPanel.maxWidth, width));
    persist();
  }

  function setRightWidth(width: number): void {
    rightWidth.value = Math.max(LAYOUT.rightPanel.minWidth, Math.min(LAYOUT.rightPanel.maxWidth, width));
    persist();
  }

  // Phase 2: 新增方法
  function toggleIrcPanel(): void {
    ircPanelOpen.value = !ircPanelOpen.value;
  }

  function setLeftPanelTab(tab: LeftPanelTab): void {
    leftPanelTab.value = tab;
  }

  return {
    mode,
    rightPanelOpen,
    activeAgentId,
    leftWidth,
    rightWidth,
    toggleMode,
    setMode,
    toggleRightPanel,
    setActiveAgent,
    setLeftWidth,
    setRightWidth,
    // Phase 2
    ircPanelOpen,
    leftPanelTab,
    toggleIrcPanel,
    setLeftPanelTab,
    // Phase 3
    budgetPanelOpen,
  };
}
