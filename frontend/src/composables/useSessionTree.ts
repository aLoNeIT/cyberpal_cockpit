import { computed } from 'vue';
import type { ComputedRef } from 'vue';
import type { AgentInfo, SessionTreeNode } from '@/types';

/**
 * 从扁平 agents Map 派生树形会话结构
 */
export function useSessionTree(agents: ComputedRef<Map<string, AgentInfo>>) {
  /**
   * 会话树：根节点为 parentId === null 的 agent
   */
  const agentTree: ComputedRef<SessionTreeNode[]> = computed(() => {
    const map = agents.value;
    return buildTree(map);
  });

  /**
   * 获取某 agent 的直接子节点
   */
  function getChildren(agentId: string): AgentInfo[] {
    const map = agents.value;
    const children: AgentInfo[] = [];
    for (const agent of map.values()) {
      if (agent.parentId === agentId) {
        children.push(agent);
      }
    }
    return children;
  }

  /**
   * 查找 agent 从根到自身的路径
   */
  function findAgentPath(agentId: string): string[] {
    const path: string[] = [agentId];
    let current = agents.value.get(agentId);

    while (current && current.parentId) {
      path.unshift(current.parentId);
      current = agents.value.get(current.parentId);
    }

    return path;
  }

  return {
    agentTree,
    getChildren,
    findAgentPath,
  };
}

/**
 * 从 Map<agentId, AgentInfo> 构建树结构
 */
function buildTree(map: Map<string, AgentInfo>): SessionTreeNode[] {
  const roots: SessionTreeNode[] = [];
  const visited = new Set<string>();

  for (const agent of map.values()) {
    if (visited.has(agent.id)) continue;

    // parentId 为 null 或父 agent 不在 Map 中的视为根节点
    if (agent.parentId === null || !map.has(agent.parentId)) {
      const node = buildNode(agent, map, visited);
      roots.push(node);
    }
  }

  return roots;
}

/**
 * 递归构建单个 SessionTreeNode
 */
function buildNode(agent: AgentInfo, map: Map<string, AgentInfo>, visited: Set<string>): SessionTreeNode {
  visited.add(agent.id);

  const label = agent.taskDescription || `Agent ${agent.id.slice(0, 8)}`;

  const children: SessionTreeNode[] = [];
  for (const childId of agent.childIds) {
    const child = map.get(childId);
    if (child && !visited.has(child.id)) {
      children.push(buildNode(child, map, visited));
    }
  }

  return {
    agentId: agent.id,
    label,
    status: agent.status,
    isOrphaned: agent.isOrphaned,
    children,
  };
}
