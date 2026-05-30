import { ref } from 'vue';
import type { Ref } from 'vue';
import { v4 as uuidv4 } from 'uuid';
import * as api from '@/services/api';
import { getItem, setItem } from '@/utils/storage';
import { STORAGE_KEYS } from '@/utils/constants';
import type { WorkspaceConfig, FileTreeNode } from '@/types';

export function useWorkspaces() {
  const workspaces: Ref<WorkspaceConfig[]> = ref([]);
  const treeData: Ref<Map<string, FileTreeNode[]>> = ref(new Map());
  const loading: Ref<boolean> = ref(false);

  function loadFromStorage(): void {
    const saved = getItem<WorkspaceConfig[]>(STORAGE_KEYS.workspaces, []);
    workspaces.value = saved;
  }

  function saveToStorage(): void {
    setItem(STORAGE_KEYS.workspaces, workspaces.value);
  }

  async function addWorkspace(name: string, path: string): Promise<WorkspaceConfig> {
    const workspace = await api.createWorkspace({ name, path });
    workspaces.value.push(workspace);
    saveToStorage();
    return workspace;
  }

  async function removeWorkspace(id: string): Promise<void> {
    await api.deleteWorkspace(id);
    workspaces.value = workspaces.value.filter((w) => w.id !== id);
    saveToStorage();
  }

  async function getTree(workspaceId: string, subPath?: string): Promise<FileTreeNode[]> {
    loading.value = true;
    try {
      const tree = await api.fetchDirectoryTree(workspaceId, subPath);
      const key = subPath ? `${workspaceId}:${subPath}` : workspaceId;
      treeData.value.set(key, tree);
      return tree;
    } finally {
      loading.value = false;
    }
  }

  function getCachedTree(workspaceId: string): FileTreeNode[] {
    return treeData.value.get(workspaceId) || [];
  }

  // 同步加载工作区列表（从后端）
  async function syncFromServer(): Promise<void> {
    try {
      const serverWorkspaces = await api.fetchWorkspaces();
      // 合并服务端和本地数据（以服务端为准）
      workspaces.value = serverWorkspaces;
      saveToStorage();
    } catch {
      // 离线时使用本地缓存
      loadFromStorage();
    }
  }

  return {
    workspaces,
    treeData,
    loading,
    loadFromStorage,
    saveToStorage,
    addWorkspace,
    removeWorkspace,
    getTree,
    getCachedTree,
    syncFromServer,
  };
}
