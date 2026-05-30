// ============ Agent 相关类型 ============

export type AgentStatus = 'running' | 'stopped' | 'error' | 'restarting';

export interface AgentInfo {
  id: string;
  cwd: string;
  status: AgentStatus;
  pid: number | null;
  workspaceId: string | null;
  createdAt: number;
  parentId: string | null;
  childIds: string[];
  taskDescription?: string;
  isOrphaned: boolean;
  model?: string;
}

// ============ 工作区相关类型 ============

export interface WorkspaceConfig {
  id: string;
  name: string;
  path: string;
  createdAt: number;
}

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  children?: FileTreeNode[];
}

// ============ 文件系统浏览类型 ============

export interface FsEntry {
  name: string;
  path: string;
  type: 'directory';
}

export interface FsBrowseResponse {
  path: string;
  entries: FsEntry[];
}

export interface FsHomeResponse {
  path: string;
}

export interface FsDrivesResponse {
  drives: string[];
  homeDrive: string;
}

// ============ 提供商配置类型 ============

export interface ProviderModel {
  id: string;
  name: string;
  isDefault?: boolean;
}

export interface ProviderSummary {
  id: string;
  name: string;
  configured: boolean;
  modelCount: number;
}

export interface ProviderDetail {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  models: ProviderModel[];
}

// ============ WebSocket 消息协议 ============

export interface WSMessage {
  type: string;
  agentId?: string;
  payload: unknown;
  timestamp: number;
}

// Phase 2 类型
export interface FileOperation {
  agentId: string;
  filePath: string;
  operation: 'create' | 'modify' | 'delete';
  timestamp: number;
}

export interface ConflictEvent {
  filePath: string;
  agentA: string;
  agentB: string;
  operationA: string;
  operationB: string;
  detectedAt: number;
}

export interface SessionTreeNode {
  agentId: string;
  label: string;
  status: AgentStatus;
  isOrphaned: boolean;
  children: SessionTreeNode[];
}

export type IrcMessageType = 'dm' | 'broadcast';

export interface IrcMessage {
  id: string;
  type: IrcMessageType;
  from: string;
  to?: string;
  message: string;
  timestamp: number;
}

// Phase 3 类型
export interface TokenUsage {
  agentId: string;
  inputTokens: number;
  outputTokens: number;
  cumulativeTokens: number;
  lastUpdated: number;
}

export interface TokenUpdateEvent {
  agentId: string;
  inputTokens: number;
  outputTokens: number;
  cumulativeTokens: number;
  model?: string;
}

export interface DailyTokenRecord {
  date: string;
  agentId: string;
  workspaceId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cumulativeTokens: number;
}

export type OverrunPolicy = 'reject_new' | 'kill_oldest' | 'warn_only';

export interface BudgetConfig {
  monthlyLimit: number;
  warningThreshold: number;
  overrunPolicy: OverrunPolicy;
  excludedAgentIds: string[];
  cycleType: 'monthly' | 'custom';
  cycleStartDay?: number;
}

export interface BudgetStatus {
  currentUsage: number;
  monthlyLimit: number;
  remaining: number;
  percentage: number;
  isWarning: boolean;
  isExceeded: boolean;
  lastResetDate: string;
  excludedUsage: number;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
  isDefault: boolean;
}

export type WSMessageType =
  | { type: 'agent:stdout'; agentId: string; payload: { data: string }; timestamp: number }
  | { type: 'agent:stderr'; agentId: string; payload: { data: string }; timestamp: number }
  | { type: 'agent:status'; agentId: string; payload: { status: AgentStatus; pid?: number }; timestamp: number }
  | { type: 'agent:exit'; agentId: string; payload: { code: number | null; signal: string | null }; timestamp: number }
  | { type: 'file:changed'; payload: { filePath: string; workspaceId: string; event: 'add' | 'change' | 'unlink' }; timestamp: number }
  | { type: 'file:content'; payload: { filePath: string; content: string; language: string }; timestamp: number }
  | { type: 'agent:task-spawn'; payload: { parentId: string; childId: string; taskDescription: string; cwd: string }; timestamp: number }
  | { type: 'agent:task-result'; payload: { childId: string; result: string; tokenCost: number }; timestamp: number }
  | { type: 'agent:irc-dm'; payload: { from: string; to: string; message: string }; timestamp: number }
  | { type: 'agent:irc-broadcast'; payload: { from: string; message: string }; timestamp: number }
  | { type: 'agent:conflict'; payload: ConflictEvent; timestamp: number }
  // Phase 3 新增
  | { type: 'agent:token-update'; payload: TokenUpdateEvent; timestamp: number }
  | { type: 'budget:warning'; payload: BudgetStatus; timestamp: number };

// ============ REST API 请求/响应类型 ============

export interface ApiResponse<T = unknown> {
  code: number;
  data: T;
  message: string;
}

export interface CreateAgentRequest {
  cwd: string;
  workspaceId?: string;
  parentId?: string;
  model?: string;
}

export interface CreateAgentResponse {
  agent: AgentInfo;
}

export interface RestartAgentRequest {
  model: string;
}

export interface StdinRequest {
  input: string;
}

export interface TreeQuery {
  path?: string;
}

export interface FileContentQuery {
  path: string;
}

export interface FileContentResponse {
  path: string;
  content: string;
  language: string;
}

export interface WorkspaceCreateRequest {
  name: string;
  path: string;
}

export interface UpdateProviderRequest {
  baseUrl?: string;
  apiKey?: string;
  models?: ProviderModel[];
}

// ============ 主题类型 ============

export type ThemeMode = 'light' | 'dark' | 'system';
