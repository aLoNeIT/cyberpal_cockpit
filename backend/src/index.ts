import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { CONFIG } from './config.js';
import { AgentManager } from './services/AgentManager.js';
import { FileWatcher } from './services/FileWatcher.js';
import { WorkspaceService } from './services/WorkspaceService.js';
import { ConflictDetector } from './services/ConflictDetector.js';
import { TokenTracker } from './services/TokenTracker.js';
import { BudgetController } from './services/BudgetController.js';
import { ProviderConfigService } from './services/ProviderConfigService.js';
import { WsHandler } from './ws/WsHandler.js';
import { createAgentRoutes } from './routes/agents.js';
import { createWorkspaceRoutes } from './routes/workspaces.js';
import { createBudgetRoutes } from './routes/budget.js';
import { createModelRoutes } from './routes/models.js';
import { createSettingsRoutes } from './routes/settings.js';

// Phase 4: 数据库持久化
import { ConnectionManager } from './db/ConnectionManager.js';
import { WorkspaceRepository } from './db/repositories/WorkspaceRepository.js';
import { AgentRepository } from './db/repositories/AgentRepository.js';
import { TokenRepository } from './db/repositories/TokenRepository.js';
import { ProviderRepository } from './db/repositories/ProviderRepository.js';
import { AgentEventRepository } from './db/repositories/AgentEventRepository.js';

// ========== 数据库初始化 ==========
const connectionManager = ConnectionManager.getInstance({
  driver: CONFIG.dbDriver,
  sqlitePath: CONFIG.dbSqlitePath,
  mysql: CONFIG.dbMysqlHost ? {
    host: CONFIG.dbMysqlHost,
    port: CONFIG.dbMysqlPort,
    user: CONFIG.dbMysqlUser,
    password: CONFIG.dbMysqlPassword,
    database: CONFIG.dbMysqlDatabase,
  } : undefined,
  autoMigrate: true,
});

const db = connectionManager.db;

// Repositories
const workspaceRepo = new WorkspaceRepository(db);
const agentRepo = new AgentRepository(db);
const tokenRepo = new TokenRepository(db);
const providerRepo = new ProviderRepository(db);
const agentEventRepo = new AgentEventRepository(db);

// ========== 服务实例（注入 Repository 依赖） ==========
const agentManager = new AgentManager();
const fileWatcher = new FileWatcher();
const workspaceService = new WorkspaceService();
const conflictDetector = new ConflictDetector();
const tokenTracker = new TokenTracker(tokenRepo);
const budgetController = new BudgetController(tokenTracker);
const providerConfigService = new ProviderConfigService(providerRepo);

// Phase 3: 注入依赖到 AgentManager
agentManager.injectDependencies(tokenTracker, budgetController, providerConfigService);

// 创建 Express 应用
const app = express();
app.use(cors({ origin: CONFIG.corsOrigin }));
app.use(express.json());

// 挂载 REST 路由（workspace 路由注入 repository）
app.use('/api', createAgentRoutes(agentManager, agentEventRepo, agentRepo));
app.use('/api', createWorkspaceRoutes(workspaceService, fileWatcher, workspaceRepo));
app.use('/api', createBudgetRoutes(budgetController, tokenTracker));
app.use('/api', createModelRoutes(providerConfigService));
app.use('/api', createSettingsRoutes(providerConfigService));

// 创建 HTTP + WebSocket 服务器
const server = createServer(app);

const wss = new WebSocketServer({ server, path: '/ws' });
const wsHandler = new WsHandler(wss);

// WebSocket 连接处理
wss.on('connection', (ws: WebSocket) => {
  wsHandler.handleConnection(ws);
});

// AgentManager → WsHandler 回调
agentManager.onOutput = (agentId, stream, data) => {
  const type = stream === 'stdout' ? 'agent:stdout' : 'agent:stderr';
  wsHandler.broadcastToAgent(agentId, { type, agentId, payload: { data }, timestamp: Date.now() });
};

agentManager.onProcessEvent = (event) => {
  wsHandler.broadcastToAgent(event.agentId, {
    type: 'agent:event',
    agentId: event.agentId,
    payload: event,
    timestamp: Date.now(),
  });
  agentEventRepo.insert(event).catch(() => {});
};

agentManager.onSessionMetadata = (agentId, sessionFile, sessionId) => {
  agentRepo.updateSession(agentId, sessionFile, sessionId).catch(() => {});
};

agentManager.onStatusChange = (agentId, status, pid?) => {
  wsHandler.broadcastToAgent(agentId, {
    type: 'agent:status',
    agentId,
    payload: { status: status as import('./types/index.js').AgentStatus, pid },
    timestamp: Date.now(),
  });

  // Phase 4: 持久化 agent 状态变更（异步 fire-and-forget）
  agentRepo.updateStatus(agentId, status, pid).catch(() => {});
};

agentManager.onExit = (agentId, code, signal) => {
  wsHandler.broadcastToAgent(agentId, { type: 'agent:exit', agentId, payload: { code, signal }, timestamp: Date.now() });
  conflictDetector.cleanupAgent(agentId);

  // Phase 4: 持久化 agent 退出状态
  agentRepo.updateStatus(agentId, 'stopped').catch(() => {});
};

agentManager.onTaskSpawn = (parentId, childId, taskDescription, cwd) => {
  wsHandler.broadcastTaskSpawn(parentId, childId, taskDescription, cwd);
};

agentManager.onTaskResult = (childId, result, tokenCost) => {
  wsHandler.broadcastTaskResult(childId, result, tokenCost);
};

agentManager.onIrcDm = (from, to, message) => {
  wsHandler.broadcastIrc('agent:irc-dm', { from, to, message });
};

agentManager.onIrcBroadcast = (from, message) => {
  wsHandler.broadcastIrc('agent:irc-broadcast', { from, message });
};

agentManager.onConflictDetected = (agentId, filePath, operation) => {
  if (operation === 'cleanup') {
    conflictDetector.cleanupAgent(agentId);
  } else {
    conflictDetector.recordOperation(agentId, filePath, operation as 'create' | 'modify' | 'delete');
  }
};

// Phase 4: Agent spawn 时持久化到数据库
const originalSpawn = agentManager.spawn.bind(agentManager);
agentManager.spawn = function(cwd: string, workspaceId?: string, parentId?: string, taskDescription?: string, model?: string) {
  const agent = originalSpawn(cwd, workspaceId, parentId, taskDescription, model);
  agentRepo.insert(agent).catch(() => {});
  return agent;
};

// ConflictDetector → WsHandler
conflictDetector.onConflict = (event) => {
  wsHandler.broadcastConflict(event);
};

// Phase 3: TokenTracker → WsHandler
tokenTracker.onTokenUpdate = (event) => {
  wsHandler.broadcastTokenUpdate(event);
};

// Phase 3: BudgetController → WsHandler
budgetController.onBudgetWarning = (status) => {
  wsHandler.broadcastBudgetWarning(status);
};

// FileWatcher 回调
fileWatcher.onChange = (workspaceId, filePath, event) => {
  wsHandler.broadcastFileChange(workspaceId, filePath, event);
};

// ========== 启动服务器 ==========
async function start(): Promise<void> {
  // Phase 4: 运行数据库迁移
  try {
    await connectionManager.initialize();
    console.log(`[CPC Backend] Database initialized (driver: ${CONFIG.dbDriver})`);
  } catch (err) {
    console.error('[CPC Backend] Database initialization failed:', err);
    console.log('[CPC Backend] Continuing without database persistence...');
  }

  // Phase 4: 初始化持久化相关服务
  try {
    await tokenTracker.init();
    console.log('[CPC Backend] TokenTracker initialized from database');
  } catch {
    console.log('[CPC Backend] TokenTracker starting with empty state');
  }

  try {
    await providerConfigService.init();
    console.log('[CPC Backend] ProviderConfigService initialized from database');
  } catch {
    console.log('[CPC Backend] ProviderConfigService starting with defaults');
  }

  server.listen(CONFIG.port, () => {
    console.log(`[CPC Backend] Server running on http://localhost:${CONFIG.port}`);
    console.log(`[CPC Backend] WebSocket endpoint: ws://localhost:${CONFIG.port}/ws`);
    console.log(`[CPC Backend] Max agents: ${CONFIG.maxAgents}`);
    console.log(`[CPC Backend] Conflict window: ${CONFIG.conflictWindowMs}ms`);
    console.log(`[CPC Backend] Budget limit: ${CONFIG.monthlyLimit === 0 ? 'unlimited' : CONFIG.monthlyLimit.toLocaleString() + ' tokens'}`);
    console.log(`[CPC Backend] Database: ${CONFIG.dbDriver} (${CONFIG.dbDriver === 'sqlite' ? CONFIG.dbSqlitePath : CONFIG.dbMysqlHost + ':' + CONFIG.dbMysqlPort + '/' + CONFIG.dbMysqlDatabase})`);
  });
}

start().catch((err) => {
  console.error('[CPC Backend] Failed to start:', err);
  process.exit(1);
});

export { app, server, wss, agentManager, fileWatcher, workspaceService, wsHandler, conflictDetector, tokenTracker, budgetController, providerConfigService };
