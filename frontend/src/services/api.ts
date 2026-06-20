import axios from 'axios';
import type {
  ApiResponse,
  AgentInfo,
  AgentEventsResponse,
  AgentConversationEvent,
  CreateAgentRequest,
  CreateAgentResponse,
  SendStdinResponse,
  WorkspaceConfig,
  WorkspaceCreateRequest,
  FileTreeNode,
  FileContentResponse,
  ModelInfo,
  BudgetConfig,
  BudgetStatus,
  DailyTokenRecord,
  ProviderSummary,
  ProviderDetail,
  ProviderModel,
  FsBrowseResponse,
  FsHomeResponse,
  FsDrivesResponse,
} from '@/types';

const http = axios.create({
  baseURL: '/api',
  timeout: 15000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// 响应拦截器
http.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.message || error.message || 'Network error';
    console.error(`[API Error] ${message}`);
    return Promise.reject(error);
  },
);

// ============ Agent API ============

export async function fetchAgents(): Promise<AgentInfo[]> {
  const res = await http.get<ApiResponse<AgentInfo[]>>('/agents');
  return res.data.data;
}

export async function fetchAgentEvents(id: string, limit: number = 500): Promise<AgentConversationEvent[]> {
  const res = await http.get<ApiResponse<AgentEventsResponse>>(`/agents/${id}/events`, {
    params: { limit },
  });
  return res.data.data.events;
}

export async function createAgent(req: CreateAgentRequest): Promise<CreateAgentResponse> {
  const res = await http.post<ApiResponse<CreateAgentResponse>>('/agents', req);
  return res.data.data;
}

export async function deleteAgent(id: string, cascade: boolean = true): Promise<void> {
  await http.delete(`/agents/${id}`, { params: { cascade: cascade ? 'true' : 'false' } });
}

// Phase 2: 获取 agent 后代列表
export async function fetchAgentChildren(id: string): Promise<AgentInfo[]> {
  const res = await http.get<ApiResponse<AgentInfo[]>>(`/agents/${id}/children`);
  return res.data.data;
}

export async function sendStdin(id: string, input: string): Promise<SendStdinResponse | null> {
  const res = await http.post<ApiResponse<SendStdinResponse | null>>(`/agents/${id}/stdin`, { input });
  return res.data.data;
}

// Phase 3: 模型切换 restart
export async function restartAgent(id: string, model: string): Promise<AgentInfo> {
  const res = await http.put<ApiResponse<{ agent: AgentInfo }>>(`/agents/${id}/restart`, { model });
  return res.data.data.agent;
}

// ============ Models API (Phase 3) ============

export async function fetchModels(): Promise<ModelInfo[]> {
  const res = await http.get<ApiResponse<ModelInfo[]>>('/models');
  return res.data.data;
}

// ============ Budget API (Phase 3) ============

export async function fetchBudget(): Promise<BudgetConfig> {
  const res = await http.get<ApiResponse<BudgetConfig>>('/budget');
  return res.data.data;
}

export async function updateBudget(config: Partial<BudgetConfig>): Promise<BudgetConfig> {
  const res = await http.put<ApiResponse<BudgetConfig>>('/budget', config);
  return res.data.data;
}

export async function fetchBudgetStatus(): Promise<BudgetStatus> {
  const res = await http.get<ApiResponse<BudgetStatus>>('/budget/status');
  return res.data.data;
}

export async function fetchTokenRecords(query?: {
  agentId?: string;
  workspaceId?: string;
  startDate?: string;
  endDate?: string;
}): Promise<DailyTokenRecord[]> {
  const res = await http.get<ApiResponse<DailyTokenRecord[]>>('/budget/tokens', { params: query });
  return res.data.data;
}

// ============ Workspace API ============

export async function fetchWorkspaces(): Promise<WorkspaceConfig[]> {
  const res = await http.get<ApiResponse<WorkspaceConfig[]>>('/workspaces');
  return res.data.data;
}

export async function createWorkspace(req: WorkspaceCreateRequest): Promise<WorkspaceConfig> {
  const res = await http.post<ApiResponse<WorkspaceConfig>>('/workspaces', req);
  return res.data.data;
}

export async function deleteWorkspace(id: string): Promise<void> {
  await http.delete(`/workspaces/${id}`);
}

export async function fetchDirectoryTree(workspaceId: string, subPath?: string): Promise<FileTreeNode[]> {
  const params: Record<string, string> = {};
  if (subPath) {
    params.path = subPath;
  }
  const res = await http.get<ApiResponse<FileTreeNode[]>>(`/workspaces/${workspaceId}/tree`, { params });
  return res.data.data;
}

export async function fetchFileContent(filePath: string): Promise<FileContentResponse> {
  const res = await http.get<ApiResponse<FileContentResponse>>('/files/content', {
    params: { path: filePath },
  });
  return res.data.data;
}

// ============ Settings / Providers API (Feature 1) ============

export async function fetchProviders(): Promise<ProviderSummary[]> {
  const res = await http.get<ApiResponse<ProviderSummary[]>>('/settings/providers');
  return res.data.data;
}

export async function fetchProviderDetail(id: string): Promise<ProviderDetail> {
  const res = await http.get<ApiResponse<ProviderDetail>>(`/settings/providers/${id}`);
  return res.data.data;
}

export async function updateProvider(
  id: string,
  req: { name?: string; baseUrl?: string; apiKey?: string; visible?: boolean; models?: ProviderModel[] },
): Promise<ProviderDetail> {
  const res = await http.put<ApiResponse<ProviderDetail>>(`/settings/providers/${id}`, req);
  return res.data.data;
}

export async function createProvider(
  id: string,
  name: string,
  baseUrl: string,
): Promise<ProviderDetail> {
  const res = await http.post<ApiResponse<ProviderDetail>>('/settings/providers', { id, name, baseUrl });
  return res.data.data;
}

export async function deleteProvider(id: string): Promise<void> {
  await http.delete<ApiResponse<null>>(`/settings/providers/${id}`);
}

export async function updateProviderKey(id: string, apiKey: string): Promise<ProviderDetail> {
  const res = await http.patch<ApiResponse<ProviderDetail>>(`/settings/providers/${id}/key`, { apiKey });
  return res.data.data;
}

// ============ File System Browse API (Feature 2) ============

export async function fetchFsHome(): Promise<FsHomeResponse> {
  const res = await http.get<ApiResponse<FsHomeResponse>>('/fs/home');
  return res.data.data;
}

export async function fetchFsBrowse(dirPath: string): Promise<FsBrowseResponse> {
  const res = await http.get<ApiResponse<FsBrowseResponse>>('/fs/browse', {
    params: { path: dirPath },
  });
  return res.data.data;
}

export async function fetchFsDrives(): Promise<FsDrivesResponse> {
  const res = await http.get<ApiResponse<FsDrivesResponse>>('/fs/drives');
  return res.data.data;
}

export default http;
