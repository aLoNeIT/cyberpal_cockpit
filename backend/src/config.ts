import { homedir } from 'os';
import { join } from 'path';

export const CONFIG = {
  // 服务器
  port: parseInt(process.env.PORT || '3001', 10),
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:5173',

  // oh-my-pi
  ohMyPiPath: process.env.OH_MY_PI_PATH || 'oh-my-pi',
  maxAgents: parseInt(process.env.MAX_AGENTS || '4', 10),
  agentSpawnTimeout: 10000,

  // WebSocket
  wsHeartbeatInterval: 30000,
  wsHeartbeatTimeout: 60000,

  // Phase 2: 冲突检测 & 级联 kill
  conflictWindowMs: 60000,
  cascadeKillDefault: true,
  ircMaxMessages: 1000,
  autoAssignSlotEnabled: true,

  // Phase 3: 预算 & Token 追踪
  monthlyLimit: parseInt(process.env.BUDGET_MONTHLY_LIMIT || '0', 10),    // 0 = 无限制
  warningThreshold: parseFloat(process.env.BUDGET_WARNING_THRESHOLD || '0.8'),
  overrunPolicy: (process.env.BUDGET_OVERRUN_POLICY || 'reject_new') as 'reject_new' | 'kill_oldest' | 'warn_only',
  tokenFlushIntervalMs: 5000,
  budgetCheckIntervalMs: 3600000,  // 1 小时检查跨月

  // Phase 4: 数据库持久化
  dbDriver: (process.env.DB_DRIVER || 'sqlite') as 'sqlite' | 'mysql',
  dbSqlitePath: process.env.DB_SQLITE_PATH || join(homedir(), '.cyberpal-cockpit', 'cpc.db'),
  dbMysqlHost: process.env.DB_MYSQL_HOST || '',
  dbMysqlPort: parseInt(process.env.DB_MYSQL_PORT || '3306', 10),
  dbMysqlUser: process.env.DB_MYSQL_USER || 'root',
  dbMysqlPassword: process.env.DB_MYSQL_PASSWORD || '',
  dbMysqlDatabase: process.env.DB_MYSQL_DATABASE || 'cyberpal_cockpit',

  // 存储
  localStoragePrefix: 'cpc_',
} as const;
