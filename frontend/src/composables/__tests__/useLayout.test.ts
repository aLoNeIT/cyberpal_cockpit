import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useLayout } from '../useLayout';

// Mock storage with proper prefix (matching real storage.ts: STORAGE_PREFIX = 'cpc_')
const storage: Record<string, string> = {};

vi.mock('@/utils/storage', () => ({
  getItem: vi.fn((key: string, fallback: any) => {
    const raw = storage['cpc_' + key];
    if (raw === undefined) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }),
  setItem: vi.fn((key: string, value: any) => {
    storage['cpc_' + key] = JSON.stringify(value);
  }),
}));

describe('useLayout', () => {
  beforeEach(() => {
    // Clear storage between tests
    Object.keys(storage).forEach((k) => delete storage[k]);
  });

  // ============ mode switching ============

  describe('mode', () => {
    it('should default to "grid" mode', () => {
      const { mode } = useLayout();
      expect(mode.value).toBe('grid');
    });

    it('should toggle from grid to single', () => {
      const { mode, toggleMode } = useLayout();
      expect(mode.value).toBe('grid');

      toggleMode();
      expect(mode.value).toBe('single');
    });

    it('should toggle from single back to grid', () => {
      const { mode, toggleMode } = useLayout();
      toggleMode(); // grid -> single
      toggleMode(); // single -> grid
      expect(mode.value).toBe('grid');
    });

    it('should set mode directly', () => {
      const { mode, setMode } = useLayout();
      setMode('single');
      expect(mode.value).toBe('single');

      setMode('grid');
      expect(mode.value).toBe('grid');
    });

    it('should persist mode to storage after toggle', () => {
      const { toggleMode } = useLayout();
      toggleMode();

      const saved = JSON.parse(storage['cpc_layout']);
      expect(saved.mode).toBe('single');
    });

    it('should persist mode to storage after setMode', () => {
      const { setMode } = useLayout();
      setMode('single');

      const saved = JSON.parse(storage['cpc_layout']);
      expect(saved.mode).toBe('single');
    });

    it('should load saved mode from storage', () => {
      storage['cpc_layout'] = JSON.stringify({
        mode: 'single',
        rightPanelOpen: true,
        leftWidth: 260,
        rightWidth: 400,
      });

      const { mode } = useLayout();
      expect(mode.value).toBe('single');
    });
  });

  // ============ rightPanelOpen ============

  describe('rightPanelOpen', () => {
    it('should default to open', () => {
      const { rightPanelOpen } = useLayout();
      expect(rightPanelOpen.value).toBe(true);
    });

    it('should toggle closed', () => {
      const { rightPanelOpen, toggleRightPanel } = useLayout();
      toggleRightPanel();
      expect(rightPanelOpen.value).toBe(false);
    });

    it('should toggle open again', () => {
      const { rightPanelOpen, toggleRightPanel } = useLayout();
      toggleRightPanel();
      toggleRightPanel();
      expect(rightPanelOpen.value).toBe(true);
    });

    it('should persist right panel state', () => {
      const { toggleRightPanel } = useLayout();
      toggleRightPanel();

      const saved = JSON.parse(storage['cpc_layout']);
      expect(saved.rightPanelOpen).toBe(false);
    });

    it('should load saved right panel state', () => {
      storage['cpc_layout'] = JSON.stringify({
        mode: 'grid',
        rightPanelOpen: false,
        leftWidth: 260,
        rightWidth: 400,
      });

      const { rightPanelOpen } = useLayout();
      expect(rightPanelOpen.value).toBe(false);
    });
  });

  // ============ activeAgentId ============

  describe('activeAgentId', () => {
    it('should default to null', () => {
      const { activeAgentId } = useLayout();
      expect(activeAgentId.value).toBeNull();
    });

    it('should set active agent id', () => {
      const { activeAgentId, setActiveAgent } = useLayout();
      setActiveAgent('agent-123');
      expect(activeAgentId.value).toBe('agent-123');
    });
  });

  // ============ leftWidth ============

  describe('leftWidth', () => {
    it('should default to 260', () => {
      const { leftWidth } = useLayout();
      expect(leftWidth.value).toBe(260);
    });

    it('should set left width within bounds', () => {
      const { leftWidth, setLeftWidth } = useLayout();
      setLeftWidth(300);
      expect(leftWidth.value).toBe(300);
    });

    it('should clamp left width to minimum 200', () => {
      const { leftWidth, setLeftWidth } = useLayout();
      setLeftWidth(100);
      expect(leftWidth.value).toBe(200);
    });

    it('should clamp left width to maximum 400', () => {
      const { leftWidth, setLeftWidth } = useLayout();
      setLeftWidth(500);
      expect(leftWidth.value).toBe(400);
    });

    it('should persist left width', () => {
      const { setLeftWidth } = useLayout();
      setLeftWidth(350);

      const saved = JSON.parse(storage['cpc_layout']);
      expect(saved.leftWidth).toBe(350);
    });
  });

  // ============ rightWidth ============

  describe('rightWidth', () => {
    it('should default to 400', () => {
      const { rightWidth } = useLayout();
      expect(rightWidth.value).toBe(400);
    });

    it('should set right width within bounds', () => {
      const { rightWidth, setRightWidth } = useLayout();
      setRightWidth(500);
      expect(rightWidth.value).toBe(500);
    });

    it('should clamp right width to minimum 300', () => {
      const { rightWidth, setRightWidth } = useLayout();
      setRightWidth(200);
      expect(rightWidth.value).toBe(300);
    });

    it('should clamp right width to maximum 600', () => {
      const { rightWidth, setRightWidth } = useLayout();
      setRightWidth(700);
      expect(rightWidth.value).toBe(600);
    });
  });
});
