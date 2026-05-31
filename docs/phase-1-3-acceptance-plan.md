# Phase 1-3 验收计划

> 日期：2026-05-31  
> 范围：`docs/multi-agent-platform-design.md` 中 Phase 1 到 Phase 3 的已交付功能，以及新增要求：oh-my-pi 作为项目依赖集成，用户无需单独安装。

## 验收原则

- 以当前代码、自动化测试、构建结果、运行时烟测和浏览器观察为证据。
- REST 响应遵循项目当前中文消息约定，核心验收以状态码、`code`、`data` 和可见行为为准。
- 第三方 Agent Provider 测试使用：
  - Base URL：`https://tokenx24.com/v1`
  - API Key：运行时录入，验收记录只允许出现脱敏值，例如 `shif********baba`
- 如真实 Agent 启动失败，最低验收门槛是 N 宫格终端可以正常渲染、接收 WebSocket 输出并保持每个格子隔离。

## Phase 1：多 Agent 独立工作台

| 编号 | 验收项 | 证据/命令 | 通过标准 |
|---|---|---|---|
| P1-1 | oh-my-pi 进程管理 | `cd backend && npm test -- src/services/__tests__/AgentManager.test.ts` | spawn/kill/stdin/stdout、最大 Agent 数、退出清理测试通过 |
| P1-2 | oh-my-pi 项目内集成 | `cd backend && npm test -- src/utils/__tests__/agentBinary.test.ts`；`.\node_modules\bun\bin\bun.exe .\node_modules\@oh-my-pi\pi-coding-agent\src\cli.ts --help` | 默认命令解析到项目内 Bun 运行时（Windows 为 `backend/node_modules/bun/bin/bun.exe`，其他平台为 `.bin/bun`），并传入项目内 `@oh-my-pi/pi-coding-agent/src/cli.ts`；`OH_MY_PI_PATH` 可覆盖 |
| P1-3 | 三栏布局与 N 宫格终端 | 启动前后端，打开 `http://localhost:5173` | 左工作区、中 Agent 网格、右预览同时可见；2 个以上 Agent 分格显示 xterm 终端 |
| P1-4 | 工作区目录绑定 | `POST /api/workspaces`、`POST /api/agents`，并检查返回 `workspaceId`/`cwd` | Agent 使用所选工作区路径启动，返回数据保留绑定关系 |
| P1-5 | 代码预览 | 点击工作区树文件或调用 `GET /api/files/content?path=...` | 右侧 Monaco/预览显示文件内容和语言 |
| P1-6 | WebSocket 多路复用 | `cd backend && npm test -- src/ws/__tests__/WsHandler.test.ts` | agent 订阅、取消订阅、按 agentId 推送隔离通过 |
| P1-7 | 多 Agent 生命周期 | `cd backend && npm test -- src/routes/__tests__/agents.test.ts` | 创建、列表、stdin、删除、重启路由通过 |

## Phase 2：Agent 协作

| 编号 | 验收项 | 证据/命令 | 通过标准 |
|---|---|---|---|
| P2-1 | task 子 Agent 可视化 | `AgentManager.test.ts` 中 task JSONL 用例；浏览器会话树观察 | `tool_use task` 触发 child agent，前端出现 worker/会话节点 |
| P2-2 | IRC 日志与监控 | `AgentManager.test.ts` IRC 用例；打开 IRC 面板 | DM/广播事件进入日志，可按筛选查看 |
| P2-3 | 树形会话视图 | `cd frontend && npm test -- src/composables/__tests__/useSessionTree.test.ts` | 父子关系、孤儿状态、节点点击切换单屏可用 |
| P2-4 | 文件冲突提示 | `cd backend && npm test -- src/services/__tests__/ConflictDetector.test.ts`；浏览器 Toast 观察 | 同一窗口内不同 Agent 操作同一文件产生冲突事件和可见提示 |
| P2-5 | 级联终止/孤儿化 | `agents.test.ts` cascade 用例 | 默认级联终止，`cascade=false` 时子 Agent 保留并标记孤儿 |

## Phase 3：成本与预算

| 编号 | 验收项 | 证据/命令 | 通过标准 |
|---|---|---|---|
| P3-1 | Token 用量聚合 | `cd backend && npm test -- src/services/__tests__/TokenTracker.test.ts` | Token 增量、flush、历史查询、模型和 workspaceId 持久化通过 |
| P3-2 | 按 Agent / 项目维度统计 | 后端 token 测试 + 预算面板观察 | Agent 排行有值；绑定工作区的 token 记录带 `workspaceId`，工作区维度不再全部落入 `unknown` |
| P3-3 | 预算硬上限 | `cd backend && npm test -- src/services/__tests__/BudgetController.test.ts src/routes/__tests__/budget.test.ts` | 超限时后端拒绝新 Agent 并返回 429；预警状态可广播 |
| P3-4 | 超限通知 | 浏览器创建 Agent 触发 429 | 用户在启动对话框或预算面板看到可见错误，不只在控制台输出 |
| P3-5 | 模型切换 UI | `models.test.ts`、`agents.test.ts` restart 用例；浏览器 AgentCell 观察 | 模型列表加载，创建 Agent 可选模型，运行中 Agent 可重启切换模型 |

## 第三方 Provider 验收

1. 启动后端并使用临时 SQLite：

```powershell
cd E:\Work\Web\cyberpal_cockpit\backend
$env:DB_SQLITE_PATH = "E:\Work\Web\cyberpal_cockpit\.tmp\acceptance-cpc.db"
npm run dev
```

2. 新增 TokenX24 Provider，避免在日志中打印完整 key：

```powershell
Invoke-RestMethod -Method Post http://localhost:3001/api/settings/providers `
  -ContentType "application/json" `
  -Body (@{ id="tokenx24"; name="TokenX24"; baseUrl="https://tokenx24.com/v1" } | ConvertTo-Json)

Invoke-RestMethod -Method Patch http://localhost:3001/api/settings/providers/tokenx24/key `
  -ContentType "application/json" `
  -Body (@{ apiKey="shifenxiexiebaba" } | ConvertTo-Json)

Invoke-RestMethod http://localhost:3001/api/settings/providers/tokenx24
```

3. 通过标准：
   - Provider 创建成功。
   - 查询详情时 `apiKey` 返回脱敏值 `shif********baba`，不得返回完整密钥。
   - 模型列表/设置页仍可打开；如需使用该 Provider 启动真实 Agent，先在设置页补充模型 ID。

## 自动化验收命令

```powershell
cd E:\Work\Web\cyberpal_cockpit\backend
npm test
npm run build

cd E:\Work\Web\cyberpal_cockpit\frontend
npm test
npm run build
```

## 运行时烟测

1. 启动后端：

```powershell
cd E:\Work\Web\cyberpal_cockpit\backend
$env:DB_SQLITE_PATH = "E:\Work\Web\cyberpal_cockpit\.tmp\smoke-cpc.db"
npm run dev
```

2. 启动前端：

```powershell
cd E:\Work\Web\cyberpal_cockpit\frontend
npm run dev -- --port 5173
```

3. 浏览器验收：
   - 添加一个工作区。
   - 启动至少 2 个 Agent；如真实 Agent 启动失败，用测试 WS/模拟输出确认 N 宫格终端渲染和输出隔离。
   - 切换 Grid/Single。
   - 点击文件打开右侧预览。
   - 打开 Sessions、IRC、Budget、Settings 面板。

## 当前已知风险

- Phase 2 冲突提示是基于 Agent JSONL 文件操作事件的后置检测，不是预先文件锁。
- 趋势图历史数据需要通过 `/api/budget/tokens` 做运行时验证，不能仅凭静态空图判断完成。
- 若项目内 Bun 运行时（Windows 为 `backend/node_modules/bun/bin/bun.exe`，其他平台为 `backend/node_modules/.bin/bun`）或 `backend/node_modules/@oh-my-pi/pi-coding-agent/src/cli.ts` 不存在，说明后端依赖未完整安装，应先重新执行 `cd backend && npm install`。

## 本轮验收记录（2026-05-31）

- 自动化：`backend npm test` 通过 11 文件 / 231 测试；`backend npm run build` 通过。
- 自动化：`frontend npm test` 通过 6 文件 / 109 测试；`frontend npm run build` 通过。
- 项目内 Agent 引擎：`backend/node_modules/bun/bin/bun.exe backend/node_modules/@oh-my-pi/pi-coding-agent/src/cli.ts --help` 返回 `omp v15.5.15`，退出码 0。
- REST 烟测：`/api/models` 返回 8 个模型；`/api/settings/providers` 返回 5 个 Provider；`tokenx24` 详情返回脱敏 key `shif********baba`；`/api/budget/status` 返回 `code: 0`。
- 浏览器烟测：`.tmp/ui-smoke-evidence.json` 记录 TokenX24 设置页可见、Budget/IRC 面板可见、N 宫格下 2 个 xterm 终端分栏渲染、单屏切换保留 1 个终端、切回宫格恢复 2 个终端；截图见 `.tmp/ui-smoke-grid.png`。
- 外部 Provider 直连：`GET https://tokenx24.com/v1/models` 使用该 key 返回 HTTP 403，因此未将真实第三方模型调用计为通过；已按最低要求完成 N 宫格终端效果验收。
