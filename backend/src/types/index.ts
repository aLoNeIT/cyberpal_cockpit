import type { ChildProcess } from 'child_process';

// ============ Agent 相关类型 ============

export type AgentStatus = 'running' | 'stopped' | 'error';

export type AgentEventKind =
  | 'user'
  | 'assistant'
  | 'working'
  | 'thinking'
  | 'tool'
  | 'summary'
  | 'stderr'
  | 'system';

export type AgentEventStatus = 'pending' | 'running' | 'completed' | 'error';

export interface AgentConversationEvent {
  id: string;
  agentId: string;
  kind: AgentEventKind;
  title?: string;
  content: string;
  status?: AgentEventStatus;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

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
  sessionFile?: string;
  sessionId?: string;
}

export interface AgentProcessInfo {
  id: string;
  cwd: string;
  status: AgentStatus;
  pid: number | null;
  workspaceId: string | null;
  process: ChildProcess | null;
  createdAt: number;
  stdoutBuffer: string[];
  stderrBuffer: string[];
  parentId: string | null;
  childIds: string[];
  taskDescription?: string;
  isOrphaned: boolean;
  fileOperations: FileOperation[];
  model?: string;
  sessionFile?: string;
  sessionId?: string;
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

export interface FsDrivesResponse {
  drives: string[];
  homeDrive: string;
}

export interface FsHomeResponse {
  path: string;
}

// ============ Demo Terminal 类型 ============

export interface TerminalFileEntry {
  name: string;
  path: string;
  type: 'directory' | 'file';
  size: number;
  modifiedAt: number;
  hasChildren?: boolean;
  children?: TerminalFileEntry[];
}

export interface TerminalListResponse {
  path: string;
  parentPath: string | null;
  entries: TerminalFileEntry[];
}

export interface TerminalCreatePayload {
  cwd?: string;
  shell?: string;
  cols: number;
  rows: number;
}

export interface TerminalCreatedPayload {
  sessionId: string;
  cwd: string;
  shell: string;
  pid: number | null;
}

export interface TerminalInputPayload {
  sessionId: string;
  data: string;
}

export interface TerminalResizePayload {
  sessionId: string;
  cols: number;
  rows: number;
}

export interface TerminalSessionPayload {
  sessionId: string;
}

export interface TerminalDataPayload {
  sessionId: string;
  data: string;
}

export interface TerminalCwdPayload {
  sessionId: string;
  cwd: string;
}

export interface TerminalExitPayload {
  sessionId: string;
  exitCode: number | null;
  signal?: number;
}

export interface TerminalErrorPayload {
  sessionId?: string;
  message: string;
}

// ============ 提供商配置类型 ============

export interface ProviderModel {
  id: string;
  name: string;
  isDefault?: boolean;
  visible?: boolean;
}

export interface ProviderConfig {
  name: string;
  baseUrl: string;
  apiKey: string;
  visible?: boolean;
  models: ProviderModel[];
}

export interface ProvidersConfig {
  providers: Record<string, ProviderConfig>;
}

export interface ProviderSummary {
  id: string;
  name: string;
  configured: boolean;
  modelCount: number;
  visible?: boolean;
}

export interface ProviderDetail {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string; // 脱敏后的
  visible?: boolean;
  models: ProviderModel[];
}

export interface ProviderModelRuntimeConfig {
  providerId: string;
  providerName: string;
  baseUrl: string;
  apiKey: string;
  model: ProviderModel;
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

// Phase 3 类型
export interface TokenUsage {
  agentId: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  cumulativeTokens: number;
  costUsd: number;
  lastUpdated: number;
}

export interface TokenUpdateEvent {
  agentId: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  cumulativeTokens: number;
  costUsd?: number;
  model?: string;
  workspaceId?: string | null;
}

export interface DailyTokenRecord {
  date: string;
  agentId: string;
  workspaceId: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  cumulativeTokens: number;
  costUsd?: number;
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
  providerId?: string;
  modelId?: string;
  selector?: string;
  visible?: boolean;
}

export type WSMessageType =
  | { type: 'agent:stdout'; agentId: string; payload: { data: string }; timestamp: number }
  | { type: 'agent:stderr'; agentId: string; payload: { data: string }; timestamp: number }
  | { type: 'agent:event'; agentId: string; payload: AgentConversationEvent; timestamp: number }
  | { type: 'agent:status'; agentId: string; payload: { status: AgentStatus; pid?: number }; timestamp: number }
  | { type: 'agent:exit'; agentId: string; payload: { code: number | null; signal: string | null }; timestamp: number }
  | { type: 'file:changed'; payload: { filePath: string; workspaceId: string; event: 'add' | 'change' | 'unlink' }; timestamp: number }
  | { type: 'file:content'; payload: { filePath: string; content: string; language: string }; timestamp: number }
  | { type: 'agent:task-spawn'; payload: { parentId: string; childId: string; taskDescription: string; cwd: string }; timestamp: number }
  | { type: 'agent:task-result'; payload: { childId: string; result: string; tokenCost: number }; timestamp: number }
  | { type: 'agent:irc-dm'; payload: { from: string; to: string; message: string }; timestamp: number }
  | { type: 'agent:irc-broadcast'; payload: { from: string; message: string }; timestamp: number }
  | { type: 'agent:conflict'; payload: ConflictEvent; timestamp: number }
  | { type: 'terminal:created'; payload: TerminalCreatedPayload; timestamp: number }
  | { type: 'terminal:data'; payload: TerminalDataPayload; timestamp: number }
  | { type: 'terminal:cwd'; payload: TerminalCwdPayload; timestamp: number }
  | { type: 'terminal:exit'; payload: TerminalExitPayload; timestamp: number }
  | { type: 'terminal:error'; payload: TerminalErrorPayload; timestamp: number }
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

export interface SendStdinResponse {
  agent?: AgentInfo;
}

export interface RestartAgentRequest {
  model: string;
}

export interface StdinRequest {
  input: string;
}

export interface AgentEventsResponse {
  events: AgentConversationEvent[];
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

export interface BrowseQuery {
  path: string;
}

export interface CreateProviderRequest {
  id: string;
  name: string;
  baseUrl: string;
}

export interface UpdateProviderRequest {
  name?: string;
  baseUrl?: string;
  apiKey?: string;
  visible?: boolean;
  models?: ProviderModel[];
}
