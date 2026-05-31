# AGENTS.md — CyberPal Cockpit 开发规范

> 本文档面向后续在此项目上工作的 AI Agent，提供完整的技术上下文、代码约定和开发指南。

---

## 1. 项目概述

**CyberPal Cockpit（赛博帕鲁驾驶舱）** 是一个多 Agent 协同开发平台，通过可视化工作台同时管理多个 oh-my-pi AI Agent。

| 属性 | 值 |
|------|-----|
| 缩写 | CPC |
| 前端 | Vue 3 + Vite + TypeScript + Tailwind CSS |
| 后端 | Node.js + Express + ws |
| 数据库 | SQLite（默认）/ MySQL |
| Agent 引擎 | oh-my-pi `--mode json` |
| 端口 | 后端 3001，前端 5173 |
| 数据库文件 | `~/.cyberpal-cockpit/cpc.db` |
| 临时文件目录 | `.tmp/`（Git 忽略） |

---

## 2. 项目结构

```
cyberpal_cockpit/
├── AGENTS.md                    ← 本文件
├── .gitignore                   # 忽略 .tmp/、node_modules/、dist/
├── .tmp/                        # 开发临时文件（截图、日志等）
├── docs/
│   ├── multi-agent-platform-design.md   # 产品设计文档
│   └── user-guide.md                    # 使用说明书
├── frontend/                    # Vue 3 SPA
│   ├── src/
│   │   ├── types/index.ts       # 全量 TypeScript 类型定义
│   │   ├── services/
│   │   │   ├── api.ts           # REST API 封装（axios）
│   │   │   └── ws.ts            # WebSocket 客户端
│   │   ├── composables/         # Vue 组合式函数（状态管理核心）
│   │   │   ├── useAgents.ts     # Agent 生命周期
│   │   │   ├── useWebSocket.ts  # WS 连接 + 消息路由
│   │   │   ├── useWorkspaces.ts # 工作区管理
│   │   │   ├── useLayout.ts     # UI 布局状态
│   │   │   ├── useFilePreview.ts# 文件预览
│   │   │   ├── useSessionTree.ts# 会话树
│   │   │   ├── useIrcLog.ts     # IRC 日志
│   │   │   ├── useBudget.ts     # 预算仪表盘
│   │   │   └── useTheme.ts      # 主题切换
│   │   ├── components/
│   │   │   ├── layout/          # AppLayout, TopBar, LeftPanel, CenterPanel, RightPanel
│   │   │   ├── workspace/       # WorkspaceManager, WorkspaceDialog, WorkspaceTree
│   │   │   ├── agent/           # AgentGrid, AgentCell, AgentLauncher, 等
│   │   │   ├── settings/        # SettingsPage, ProviderConfig
│   │   │   ├── budget/          # BudgetPanel, TokenBarChart, etc.
│   │   │   ├── preview/         # CodePreview, CodeDiff
│   │   │   ├── session/         # SessionTree
│   │   │   ├── irc/             # IrcLogPanel
│   │   │   ├── conflict/        # ConflictToast
│   │   │   └── common/          # ResizeHandle, StatusBadge
│   │   └── utils/               # constants.ts, storage.ts
│   └── vite.config.ts           # 代理 /api → 3001, /ws → ws://3001
└── backend/                     # Node.js 服务
    └── src/
        ├── index.ts             # 入口：Express + WS + DB 初始化
        ├── config.ts            # 全局配置常量
        ├── types/index.ts       # 后端类型定义（前后端共享）
        ├── routes/              # REST 路由
        │   ├── agents.ts        # Agent CRUD
        │   ├── workspaces.ts    # 工作区 + 文件浏览
        │   ├── settings.ts      # 提供商配置
        │   └── budget.ts        # 预算 API
        ├── services/            # 业务逻辑
        │   ├── AgentManager.ts  # oh-my-pi 进程管理
        │   ├── WorkspaceService.ts # 文件系统操作
        │   ├── TokenTracker.ts  # Token 用量追踪
        │   ├── BudgetController.ts # 预算限制
        │   ├── ConflictDetector.ts # 文件冲突检测
        │   ├── FileWatcher.ts   # chokidar 文件监听
        │   └── ProviderConfigService.ts # 提供商配置
        ├── ws/
        │   └── WsHandler.ts     # WebSocket 多路复用
        └── db/                  # 数据库层
            ├── DatabaseInterface.ts   # 异步统一接口
            ├── SQLiteAdapter.ts       # better-sqlite3 实现
            ├── MySQLAdapter.ts        # mysql2 实现
            ├── ConnectionManager.ts   # 单例管理器
            ├── MigrationManager.ts    # 迁移系统
            ├── migrations/            # 迁移脚本（TS 文件）
            └── repositories/          # 数据访问层
```

---

## 3. 代码约定

### 3.1 通用

```
缩进：2 空格
引号：单引号
分号：必须
文件命名：Vue 组件 PascalCase（AgentCell.vue），TS 模块 camelCase（useAgents.ts）
```

### 3.2 前端

```
Vue 组件顺序：<script setup lang="ts"> → <template> → <style scoped>
Composable：use 前缀 + camelCase（useAgents）。每个 composable 自包含、可独立测试
CSS：Tailwind 原子类优先。自定义颜色使用 cockpit-* 变量：
  bg-cockpit-bg / bg-cockpit-surface / bg-cockpit-panel
  text-cockpit-text / text-cockpit-muted / text-cockpit-accent
  border-cockpit-border
  text-cockpit-success / text-cockpit-danger / text-cockpit-warning
状态管理：ref / reactive → composable → props/emits。不跨组件直接读写 DOM
```

### 3.3 后端

```
REST 路由：kebab-case 复数名词（/api/agents、/api/workspaces）
统一响应：{ code: 0 | -1, data: T, message: string }
错误处理：try-catch 包裹，返回 ApiResponse，HTTP 状态码 200/201/400/404/500
异步：所有 repository 和路由处理函数使用 async/await
数据库操作：通过 DatabaseInterface → Repository 层，不直接写 SQL
```

### 3.4 WebSocket

```
消息类型：namespace:action 格式（agent:stdout、agent:status、file:changed）
消息结构：{ type, agentId?, payload, timestamp }
心跳：每 30s 服务端发 ping，客户端回 pong
前端：useWebSocket.onMessage(type, handler) 注册路由
```

### 3.5 TypeScript 类型

```
前后端共享类型定义在各自的 types/index.ts
接口命名：PascalCase（AgentInfo、WSMessage）
枚举/联合：PascalCase（AgentStatus）
API 请求体：XxxRequest；API 响应体：ApiResponse<T>
```

---

## 4. 关键架构模式

### 4.1 数据流

```
用户操作 → Vue Composable → api.ts (REST) / ws.ts (WebSocket)
  → Express Router → Service → Repository → DatabaseInterface → DB

DB 写入 → Service 回调 → WsHandler.broadcast → WebSocket
  → 前端 useWebSocket.onMessage → Composable 更新 → 组件响应式渲染
```

### 4.2 Agent 生命周期

```
AgentLauncher (前端) → POST /api/agents
  → AgentManager.spawn(cwd, model?)
    → BudgetController.checkBudget() → ok/warning/rejected
    → child_process.spawn(CONFIG.ohMyPiPath, [...CONFIG.ohMyPiArgsPrefix, '--mode', 'json'], { cwd })
      # 默认 CONFIG.ohMyPiPath 指向项目内 Bun 运行时（Windows 为 backend/node_modules/bun/bin/bun.exe），并将项目内 @oh-my-pi/pi-coding-agent/src/cli.ts 作为首个参数传入
      # 不要求用户全局安装 bun 或 oh-my-pi
    → 监听 stdout → parseJSONL → TokenTracker.recordUsage()
    → 监听 exit → AgentManager.cleanup()
  → WsHandler.broadcastToAgent → 前端 AgentCell 实时渲染
```

### 4.3 主题系统

```
useTheme.ts 管理三种模式：light / dark / system
<html data-theme="light|dark"> 控制 CSS 变量
组件使用 cockpit-* 颜色类（自动跟随主题）
xterm.js：MutationObserver 监听 data-theme 切换主题
Monaco：MutationObserver 切换 vs / vs-dark
```

### 4.4 数据库操作

```
启动流程：
  1. ConnectionManager.create(config) → 创建 SQLiteAdapter 或 MySQLAdapter
  2. MigrationManager.runMigrations() → 执行未应用的迁移
  3. 注入 Repository 实例到 Service

添加新表：
  1. 在 db/migrations/ 创建 NNN_description.ts
  2. 导出 up(db) 和 down(db) 函数
  3. 在相关 Repository 中添加 CRUD 方法
  4. 迁移自动在启动时执行

⚠️ 迁移中的 db.execute() 必须 await（虽然 SQLite 是同步的，但接口是 async）
```

---

## 5. 测试规范

```
框架：vitest
后端测试：backend/src/**/__tests__/*.test.ts
前端测试：frontend/src/**/__tests__/*.test.ts
运行：cd backend && npm test / cd frontend && npm test
Mock：优先使用 vi.mock() / vi.fn()，不依赖真实 oh-my-pi 进程
```

---

## 6. 常见模式与注意事项

### 6.1 必须避免

- ❌ 直接操作 `~/.cyberpal-cockpit/` 下的 JSON 文件 → 使用 Repository 层
- ❌ 在 Vue 组件中直接调用 axios → 通过 composable → api.ts
- ❌ 硬编码颜色 → 使用 cockpit-* 变量
- ❌ 在迁移中不加 `await` 调用 `db.execute()`
- ❌ 跨组件直连通信 → 通过 composable 或 props/emits

### 6.2 标准做法

- 新增 REST 端点 → 在 routes/ 加路由 → 在 services/ 加逻辑 → 在 types/ 加类型
- 新增前端功能 → 在 composables/ 加状态 → 在 components/ 加组件 → 在 types/ 加类型
- 文件操作 → WorkspaceService
- 进程操作 → AgentManager
- 持久化 → Repository → DatabaseInterface

### 6.3 路径约定

- `~/.cyberpal-cockpit/cpc.db` — SQLite 数据库
- `~/.cyberpal-cockpit/providers.json` — 旧版配置文件（仍可能存在）
- `~/.cyberpal-cockpit/tokens.json` — 旧版 Token 文件
- 所有磁盘路径使用 POSIX 风格 `/`，后端自动处理 Windows 兼容

---

## 7. 启动与调试

```bash
# 安装依赖
cd backend && npm install
cd frontend && npm install  # 需要先移除 markstream-vue（如存在）

# 启动开发服务器
cd backend && npx tsx src/index.ts     # http://localhost:3001
cd frontend && npx vite --port 5173    # http://localhost:5173

# 运行测试
cd backend && npm test    # 预期：10 文件，224 测试全过
cd frontend && npm test   # 预期：6 文件，104 测试全过

# 数据库配置
# SQLite（默认）：零配置，自动创建
# MySQL：设置环境变量 DB_DRIVER=mysql + DB_MYSQL_* 系列
```

---

## 8. 版本兼容

- Node.js ≥ 18
- TypeScript 5.5+
- Vue 3.4+
- 前端依赖：xterm.js 5.3、monaco-editor 0.50、chart.js 4.4、tailwindcss 3.4
- 后端依赖：express 4.20、ws 8.18、better-sqlite3（latest）、mysql2（latest）
- ⚠️ `markstream-vue@^0.1.0` 在 npm 注册表中不可用，需移除

---

> **Slogan**：帕鲁就绪，静待指令。
