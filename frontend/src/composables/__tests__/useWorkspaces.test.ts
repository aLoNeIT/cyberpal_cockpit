import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useWorkspaces } from '../useWorkspaces';
import type { WorkspaceConfig, FileTreeNode } from '@/types';

// Mock storage with proper prefix
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

// Mock API — inline all definitions (vi.mock is hoisted)
vi.mock('@/services/api', () => ({
  fetchWorkspaces: vi.fn(),
  createWorkspace: vi.fn(),
  deleteWorkspace: vi.fn(),
  fetchDirectoryTree: vi.fn(),
}));

import * as mockApi from '@/services/api';

// Mock uuid
vi.mock('uuid', () => ({
  v4: vi.fn(() => 'frontend-ws-mock-id'),
}));

describe('useWorkspaces', () => {
  beforeEach(() => {
    Object.keys(storage).forEach((k) => delete storage[k]);
    vi.clearAllMocks();
  });

  // ============ loadFromStorage / saveToStorage ============

  describe('loadFromStorage', () => {
    it('should load empty array when nothing saved', () => {
      const { workspaces, loadFromStorage } = useWorkspaces();
      loadFromStorage();
      expect(workspaces.value).toEqual([]);
    });

    it('should load saved workspaces from storage', () => {
      const saved: WorkspaceConfig[] = [
        { id: 'ws-1', name: 'Project A', path: '/path/a', createdAt: 1000 },
        { id: 'ws-2', name: 'Project B', path: '/path/b', createdAt: 2000 },
      ];
      storage['cpc_workspaces'] = JSON.stringify(saved);

      const { workspaces, loadFromStorage } = useWorkspaces();
      loadFromStorage();

      expect(workspaces.value).toHaveLength(2);
      expect(workspaces.value[0].name).toBe('Project A');
    });
  });

  describe('saveToStorage', () => {
    it('should persist workspaces to storage', () => {
      const { workspaces, saveToStorage } = useWorkspaces();
      workspaces.value = [
        { id: 'ws-x', name: 'X', path: '/x', createdAt: 1 },
      ];
      saveToStorage();

      const saved = JSON.parse(storage['cpc_workspaces']);
      expect(saved).toHaveLength(1);
      expect(saved[0].name).toBe('X');
    });
  });

  // ============ addWorkspace ============

  describe('addWorkspace', () => {
    it('should add a workspace via API and persist', async () => {
      const newWs: WorkspaceConfig = {
        id: 'ws-api-1', name: 'New Project', path: '/new', createdAt: Date.now(),
      };
      (mockApi.createWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue(newWs);

      const { workspaces, addWorkspace } = useWorkspaces();
      const result = await addWorkspace('New Project', '/new');

      expect(result).toEqual(newWs);
      expect(workspaces.value).toHaveLength(1);
      expect(workspaces.value[0].name).toBe('New Project');
      expect(mockApi.createWorkspace).toHaveBeenCalledWith({
        name: 'New Project',
        path: '/new',
      });

      // Should be persisted
      const saved = JSON.parse(storage['cpc_workspaces']);
      expect(saved).toHaveLength(1);
    });

    it('should throw when API fails', async () => {
      (mockApi.createWorkspace as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('API error'));

      const { addWorkspace } = useWorkspaces();
      await expect(addWorkspace('Fail', '/fail')).rejects.toThrow('API error');
    });
  });

  // ============ removeWorkspace ============

  describe('removeWorkspace', () => {
    it('should remove a workspace via API and update state', async () => {
      (mockApi.deleteWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (mockApi.createWorkspace as ReturnType<typeof vi.fn>).mockResolvedValue({
        id: 'ws-1', name: 'To Remove', path: '/rm', createdAt: 1,
      });

      const { workspaces, addWorkspace, removeWorkspace } = useWorkspaces();
      await addWorkspace('To Remove', '/rm');
      expect(workspaces.value).toHaveLength(1);

      await removeWorkspace('ws-1');

      expect(workspaces.value).toHaveLength(0);
      expect(mockApi.deleteWorkspace).toHaveBeenCalledWith('ws-1');

      // Should be persisted
      const saved = JSON.parse(storage['cpc_workspaces']);
      expect(saved).toHaveLength(0);
    });
  });

  // ============ getTree / getCachedTree ============

  describe('getTree', () => {
    it('should fetch directory tree and cache it', async () => {
      const mockTree: FileTreeNode[] = [
        { name: 'src', path: '/src', type: 'directory', children: [] },
        { name: 'README.md', path: '/README.md', type: 'file' },
      ];
      (mockApi.fetchDirectoryTree as ReturnType<typeof vi.fn>).mockResolvedValue(mockTree);

      const { getTree, treeData } = useWorkspaces();
      const tree = await getTree('ws-1');

      expect(tree).toEqual(mockTree);
      expect(mockApi.fetchDirectoryTree).toHaveBeenCalledWith('ws-1', undefined);
      expect(treeData.value.get('ws-1')).toEqual(mockTree);
    });

    it('should fetch tree with subPath', async () => {
      (mockApi.fetchDirectoryTree as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const { getTree } = useWorkspaces();

      await getTree('ws-1', 'src/components');

      expect(mockApi.fetchDirectoryTree).toHaveBeenCalledWith('ws-1', 'src/components');
    });

    it('should set loading flag during fetch', async () => {
      let resolvePromise: (value: FileTreeNode[]) => void;
      const promise = new Promise<FileTreeNode[]>((resolve) => {
        resolvePromise = resolve;
      });
      (mockApi.fetchDirectoryTree as ReturnType<typeof vi.fn>).mockReturnValue(promise);

      const { getTree, loading } = useWorkspaces();
      const treePromise = getTree('ws-1');

      expect(loading.value).toBe(true);

      resolvePromise!([]);
      await treePromise;

      expect(loading.value).toBe(false);
    });
  });

  describe('getCachedTree', () => {
    it('should return empty array when no cache', () => {
      const { getCachedTree } = useWorkspaces();
      expect(getCachedTree('nonexistent')).toEqual([]);
    });

    it('should return cached tree data', async () => {
      const mockTree: FileTreeNode[] = [
        { name: 'app.ts', path: '/app.ts', type: 'file' },
      ];
      (mockApi.fetchDirectoryTree as ReturnType<typeof vi.fn>).mockResolvedValue(mockTree);

      const { getTree, getCachedTree } = useWorkspaces();
      await getTree('ws-1');

      const cached = getCachedTree('ws-1');
      expect(cached).toEqual(mockTree);
    });
  });

  // ============ syncFromServer ============

  describe('syncFromServer', () => {
    it('should sync workspaces from server', async () => {
      const serverWorkspaces: WorkspaceConfig[] = [
        { id: 'srv-1', name: 'Server WS', path: '/srv', createdAt: 5000 },
      ];
      (mockApi.fetchWorkspaces as ReturnType<typeof vi.fn>).mockResolvedValue(serverWorkspaces);

      const { workspaces, syncFromServer } = useWorkspaces();
      await syncFromServer();

      expect(workspaces.value).toEqual(serverWorkspaces);

      // Should persist
      const saved = JSON.parse(storage['cpc_workspaces']);
      expect(saved).toEqual(serverWorkspaces);
    });

    it('should fall back to localStorage on error', async () => {
      (mockApi.fetchWorkspaces as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Offline'));

      const saved: WorkspaceConfig[] = [
        { id: 'local-1', name: 'Local WS', path: '/local', createdAt: 100 },
      ];
      storage['cpc_workspaces'] = JSON.stringify(saved);

      const { workspaces, loadFromStorage, syncFromServer } = useWorkspaces();
      loadFromStorage();
      expect(workspaces.value).toEqual(saved);

      await syncFromServer();

      // Should still have local data (fallback)
      expect(workspaces.value).toEqual(saved);
    });
  });
});
