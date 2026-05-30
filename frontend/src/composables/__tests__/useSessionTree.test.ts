import { describe, it, expect, beforeEach } from 'vitest';
import { computed, ref } from 'vue';
import type { Ref, ComputedRef } from 'vue';
import { useSessionTree } from '../useSessionTree';
import type { AgentInfo } from '@/types';

// Mock SessionTreeNode type from the composable
function makeAgent(overrides: Partial<AgentInfo> & { id: string }): AgentInfo {
  return {
    cwd: '/test',
    status: 'running',
    pid: null,
    workspaceId: null,
    createdAt: Date.now(),
    parentId: null,
    childIds: [],
    isOrphaned: false,
    ...overrides,
  };
}

describe('useSessionTree', () => {
  function createAgentsMap(agents: AgentInfo[]): ComputedRef<Map<string, AgentInfo>> {
    const map = new Map<string, AgentInfo>();
    for (const a of agents) {
      map.set(a.id, a);
    }
    // Must be a ref to be reactive, but for computed we wrap in a computed
    const mapRef: Ref<Map<string, AgentInfo>> = ref(map);
    return computed(() => mapRef.value);
  }

  // ============ agentTree ============

  describe('agentTree', () => {
    it('should return empty array when no agents', () => {
      const agentsRef = createAgentsMap([]);
      const { agentTree } = useSessionTree(agentsRef);
      expect(agentTree.value).toEqual([]);
    });

    it('should show root agents (parentId === null)', () => {
      const agentsRef = createAgentsMap([
        makeAgent({ id: 'root-1', taskDescription: 'Root task' }),
        makeAgent({ id: 'root-2', taskDescription: 'Another root' }),
      ]);
      const { agentTree } = useSessionTree(agentsRef);
      expect(agentTree.value).toHaveLength(2);
      expect(agentTree.value[0].agentId).toBe('root-1');
      expect(agentTree.value[0].label).toBe('Root task');
      expect(agentTree.value[1].agentId).toBe('root-2');
    });

    it('should show orphaned agents as roots', () => {
      const agentsRef = createAgentsMap([
        makeAgent({ id: 'orphan-1', parentId: null, isOrphaned: true, taskDescription: 'Orphan' }),
        makeAgent({ id: 'orphan-2', parentId: 'dead-parent', isOrphaned: true }),
      ]);
      const { agentTree } = useSessionTree(agentsRef);
      expect(agentTree.value).toHaveLength(2);
      expect(agentTree.value[0].isOrphaned).toBe(true);
      expect(agentTree.value[1].isOrphaned).toBe(true);
    });

    it('should build nested hierarchy from childIds', () => {
      const agentsRef = createAgentsMap([
        makeAgent({ id: 'root', childIds: ['child-1', 'child-2'] }),
        makeAgent({ id: 'child-1', parentId: 'root', childIds: ['grandchild'], taskDescription: 'Child 1' }),
        makeAgent({ id: 'child-2', parentId: 'root', taskDescription: 'Child 2' }),
        makeAgent({ id: 'grandchild', parentId: 'child-1', taskDescription: 'Grandchild' }),
      ]);
      const { agentTree } = useSessionTree(agentsRef);
      expect(agentTree.value).toHaveLength(1);

      const root = agentTree.value[0];
      expect(root.agentId).toBe('root');
      expect(root.children).toHaveLength(2);

      const child1 = root.children[0];
      expect(child1.agentId).toBe('child-1');
      expect(child1.label).toBe('Child 1');
      expect(child1.children).toHaveLength(1);

      const grandchild = child1.children[0];
      expect(grandchild.agentId).toBe('grandchild');
      expect(grandchild.label).toBe('Grandchild');
      expect(grandchild.children).toHaveLength(0);
    });

    it('should use truncated id as label when no taskDescription', () => {
      const id = 'abc123def456ghi789';
      const agentsRef = createAgentsMap([
        makeAgent({ id }),
      ]);
      const { agentTree } = useSessionTree(agentsRef);
      expect(agentTree.value[0].label).toBe(`Agent ${id.slice(0, 8)}`);
    });

    it('should include status in tree nodes', () => {
      const agentsRef = createAgentsMap([
        makeAgent({ id: 'running', status: 'running' }),
        makeAgent({ id: 'stopped', status: 'stopped' }),
        makeAgent({ id: 'error', status: 'error' }),
      ]);
      const { agentTree } = useSessionTree(agentsRef);
      expect(agentTree.value[0].status).toBe('running');
      expect(agentTree.value[1].status).toBe('stopped');
      expect(agentTree.value[2].status).toBe('error');
    });

    it('should handle agent whose parent is not in map as root', () => {
      const agentsRef = createAgentsMap([
        makeAgent({ id: 'detached', parentId: 'missing-parent' }),
      ]);
      const { agentTree } = useSessionTree(agentsRef);
      expect(agentTree.value).toHaveLength(1);
      expect(agentTree.value[0].agentId).toBe('detached');
    });
  });

  // ============ getChildren ============

  describe('getChildren', () => {
    it('should return direct children of an agent', () => {
      const agentsRef = createAgentsMap([
        makeAgent({ id: 'root', childIds: ['child-1', 'child-2'] }),
        makeAgent({ id: 'child-1', parentId: 'root' }),
        makeAgent({ id: 'child-2', parentId: 'root' }),
      ]);
      const { getChildren } = useSessionTree(agentsRef);

      const children = getChildren('root');
      expect(children).toHaveLength(2);
      expect(children.map((c) => c.id)).toEqual(['child-1', 'child-2']);
    });

    it('should return empty array when no children', () => {
      const agentsRef = createAgentsMap([
        makeAgent({ id: 'loner' }),
      ]);
      const { getChildren } = useSessionTree(agentsRef);
      expect(getChildren('loner')).toEqual([]);
    });
  });

  // ============ findAgentPath ============

  describe('findAgentPath', () => {
    it('should return path from root to agent', () => {
      const agentsRef = createAgentsMap([
        makeAgent({ id: 'root', childIds: ['mid'] }),
        makeAgent({ id: 'mid', parentId: 'root', childIds: ['leaf'] }),
        makeAgent({ id: 'leaf', parentId: 'mid' }),
      ]);
      const { findAgentPath } = useSessionTree(agentsRef);

      expect(findAgentPath('leaf')).toEqual(['root', 'mid', 'leaf']);
    });

    it('should return just agent id for root agent', () => {
      const agentsRef = createAgentsMap([
        makeAgent({ id: 'root' }),
      ]);
      const { findAgentPath } = useSessionTree(agentsRef);
      expect(findAgentPath('root')).toEqual(['root']);
    });

    it('should include parentId in path even when parent not in map', () => {
      const agentsRef = createAgentsMap([
        makeAgent({ id: 'orphan', parentId: 'dead-parent' }),
      ]);
      const { findAgentPath } = useSessionTree(agentsRef);
      // The implementation adds parentId to path before checking if parent exists in map
      expect(findAgentPath('orphan')).toEqual(['dead-parent', 'orphan']);
    });
  });
});
