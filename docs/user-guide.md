# CyberPal Cockpit 使用说明书

## 1. 项目简介

CyberPal Cockpit 是一个多 Agent 协同开发平台，基于 oh-my-pi 框架构建。它提供了可视化的工作区管理、实时终端监控、Agent 编排和 Token 预算管理功能，帮助开发者高效地利用 AI Agent 进行软件开发和协作。

### 核心特性

- **多 Agent 协同**：同时运行多个 AI Agent，支持父子 Agent 级联任务
- **工作区管理**：轻松添加、浏览和管理多个项目工作区
- **实时终端**：通过 xterm.js 查看 Agent 的实时输出
- **代码预览**：集成 Monaco Editor 进行代码高亮预览
- **灵活布局**：支持 N 宫格和单屏两种视图模式
- **会话树**：可视化 Agent 之间的父子关系和任务派生
- **IRC 通信日志**：查看 Agent 之间的直接消息和广播通信
- **Token 预算管理**：监控 Token 消耗，设置预算上限和预警
- **提供商配置**：配置多个 AI 服务提供商的 API Key 和模型，支持自定义添加
- **主题切换**：支持亮色/暗色/跟随系统三种主题模式
- **数据库持久化**：SQLite（默认）或 MySQL 双引擎，工作区/Token/配置持久存储

---

## 2. 系统要求

- **Node.js**：18.0 或更高版本
- **包管理器**：npm（随 Node.js 一起安装）
- **Agent 引擎**：oh-my-pi 已作为后端 npm 依赖集成，执行 `npm install` 即可安装；用户无需单独安装全局 `oh-my-pi` 命令
- **操作系统**：Windows、macOS 或 Linux

---

## 3. 快速开始

### 3.1 克隆项目

```bash
git clone <repository-url>
cd cyberpal_cockpit
```

### 3.2 安装依赖

```bash
# 安装后端依赖
cd backend
npm install

# 安装前端依赖
cd ../frontend
npm install
```

> 后端依赖会安装 `bun` 与 `@oh-my-pi/pi-coding-agent`，CPC 默认通过项目内 Bun 运行时（Windows 为 `backend/node_modules/bun/bin/bun.exe`，其他平台为 `backend/node_modules/.bin/bun`）运行项目内的 `@oh-my-pi/pi-coding-agent/src/cli.ts`。仅在调试自定义引擎时才需要设置 `OH_MY_PI_PATH` 覆盖默认路径。

### 3.3 启动后端

在 `backend` 目录下：

```bash
npm run dev
```

后端将在 `http://localhost:3001` 启动。

### 3.4 启动前端

在 `frontend` 目录下：

```bash
npm run dev
```

前端开发服务器将在 `http://localhost:5173` 启动。

### 3.5 访问应用

在浏览器中打开 `http://localhost:5173` 即可使用 CyberPal Cockpit。

---

## 4. 核心功能

### 4.1 工作区管理

工作区是 Agent 工作的目录上下文。

**添加工作区**：

1. 点击左侧面板中 "Workspaces" 旁边的 **+** 按钮
2. 在弹出的对话框中填写工作区名称（如 `my-project`）
3. 使用文件浏览器选择工作区的根目录路径
4. 可选：输入项目子路径（如 `/src`）
5. 点击 **Add** 确认

**文件浏览器功能**：

- **驱动器切换**：顶部横条显示所有可用驱动器（C:、D:、E: 等），点击即切换
- **↑ Up**：返回上级目录
- **面包屑导航**：点击路径段快速跳转（如 `C:/ / Users / wangr`）
- **目录列表**：单击选中目录，双击进入子目录
- **起始位置**：默认从用户主目录开始浏览

**浏览工作区**：

- 点击工作区名称展开/折叠目录树
- 点击文件可在右侧预览面板查看内容
- 点击 **↻ Refresh** 刷新目录树

**删除工作区**：

- 将鼠标悬停在工作区名称上，点击右侧出现的 **✕** 按钮

### 4.2 Agent 管理

**创建 Agent**：

1. 点击顶栏的 **+ Agent** 按钮
2. 选择工作区作为 Agent 的工作目录
3. 可选选择模型（默认使用系统默认模型）
4. 确认后 Agent 将自动启动

**查看 Agent 输出**：

- Agent 的输出实时显示在终端面板中
- 点击 **MD** 按钮可切换到 Markdown 渲染视图
- 输出内容会自动滚动到底部

**发送输入**：

- 在 Agent 运行状态下，底部的输入框可向 Agent 发送 stdin 输入
- 按 **Enter** 发送，**Shift+Enter** 换行

**切换模型**：

- 运行中的 Agent 可点击 🔄 按钮切换使用的 AI 模型
- 切换时 Agent 会自动重启

**终止 Agent**：

- 点击 Agent 面板上的 **✕** 按钮终止 Agent
- 如果 Agent 有子 Agent，会弹出级联终止确认
  - **OK**：终止所有后代 Agent
  - **Cancel**：仅终止此 Agent，子 Agent 变为孤儿状态

### 4.3 布局切换

- 点击顶栏 **⊞ Grid** / **⊟ Single** 按钮切换布局模式
- **N 宫格模式**：所有 Agent 以网格形式平铺显示（1-2 列自动适配）
- **单屏模式**：通过标签栏切换不同的 Agent，每次显示一个

### 4.4 会话树

切换到左侧面板的 **Sessions** 标签查看会话树：

- 以树形结构展示所有 Agent 之间的父子关系
- 每个节点显示 Agent 的状态（运行中/已停止/错误/孤儿）
- 点击节点自动切换到单屏模式并聚焦该 Agent

### 4.5 代码预览

- 在左侧工作区目录树中点击文件，右侧面板将使用 Monaco Editor 高亮显示文件内容
- 支持语法高亮和代码折叠
- 文件变化时自动刷新内容
- 可通过 **☰ Preview** 按钮开关预览面板

### 4.6 IRC 通信日志

- 点击顶栏的 💬 按钮打开 IRC 通信日志面板
- 查看 Agent 之间的直接消息 (DM) 和广播消息
- 支持按发送方/接收方过滤

### 4.7 预算与 Token 监控

- 点击顶栏的 💰 按钮打开预算仪表盘
- 查看当前 Token 消耗量、剩余预算、使用百分比
- 支持按 Agent 或按工作区维度查看 Token 用量
- 可配置：
  - **月预算上限**：设置每月 Token 消耗上限
  - **预警阈值**：达到一定比例时发出预警（默认 80%）
  - **超额策略**：reject_new（拒绝新 Agent）/ kill_oldest（终止最旧 Agent）/ warn_only（仅预警）

### 4.8 提供商配置

- 点击顶栏的 ⚙ 按钮打开设置页面
- 切换到 **Provider** 标签
- 左侧列表显示所有提供商及其配置状态（🟢 已配置 / ⚫ 未配置）
- 选中某个提供商后，可配置：
  - **Name**：提供商标识名称（可编辑）
  - **ID**：唯一标识符（只读）
  - **API Base URL**：API 服务地址
  - **API Key**：认证密钥（支持显示/隐藏切换）
  - **模型列表**：添加/删除模型，设置默认模型
  - 点击 **Save** 保存，**Reset** 恢复原始值

**添加自定义提供商**：

1. 点击 Provider 列表顶部的 **+ Add** 按钮
2. 填写 Provider ID（如 `groq`）、显示名称（如 `Groq`）、Base URL
3. 点击 **Add** 创建
4. 新提供商会出现在列表中，使用 🔧 图标标记
5. 无需时点击底部红色 **Delete** 按钮删除

**注意**：内置的 4 家提供商（DeepSeek、OpenAI、Alibaba、Anthropic）不可删除，显示 "Built-in" 标记。

### 4.9 主题切换

- 点击顶栏的 🎨 按钮打开主题选择菜单
- 三种模式：
  - **☀️ Light**：亮色主题
  - **🌙 Dark**：暗色主题（默认）
  - **🖥 System**：跟随系统主题设置
- 选择后立即生效，所有组件（终端、编辑器、UI）同步切换

### 4.10 数据库持久化

CyberPal Cockpit 使用数据库存储所有运行数据，替代简单的 JSON 文件存储。

**支持的数据库**：

| 数据库 | 说明 | 适用场景 |
|--------|------|---------|
| **SQLite**（默认） | 零配置，数据库文件自动创建 | 本地开发、单机部署 |
| **MySQL** | 需配置连接信息 | 生产环境、多实例共享 |

**数据存储位置**：

- SQLite 数据库文件：`~/.cyberpal-cockpit/cpc.db`
- 自动迁移：首次启动时自动创建表和初始数据

**切换到 MySQL**：

设置以下环境变量后启动：

```bash
DB_DRIVER=mysql
DB_MYSQL_HOST=localhost
DB_MYSQL_PORT=3306
DB_MYSQL_USER=root
DB_MYSQL_PASSWORD=your_password
DB_MYSQL_DATABASE=cyberpal_cockpit
```

**持久化的数据**：

| 数据 | 说明 |
|------|------|
| 工作区配置 | 工作区名称、路径 |
| 提供商配置 | API Key、模型列表 |
| Token 记录 | 每次 Agent 调用的 Token 消耗 |
| Agent 历史 | Agent 的运行记录 |

---

## 5. 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Enter` | 在输入框中发送消息给 Agent |
| `Shift+Enter` | 在输入框中换行 |

---

## 6. 常见问题

### Q: 启动后端时提示端口被占用？

A: 默认端口为 3001。可以通过环境变量 `PORT=3002` 指定其他端口：

```bash
PORT=3002 npm run dev
```

同时需要更新前端 Vite 代理配置中的后端地址。

### Q: Agent 无法启动？

A: 请检查以下事项：
1. 确保已在 `backend` 目录执行 `npm install`，并且项目内 Bun 运行时（Windows 为 `backend/node_modules/bun/bin/bun.exe`，其他平台为 `backend/node_modules/.bin/bun`）和 `backend/node_modules/@oh-my-pi/pi-coding-agent/src/cli.ts` 存在
2. 确保工作区路径有效且具有读写权限
3. 如需使用自定义 Agent 引擎，可设置 `OH_MY_PI_PATH` 指向对应可执行文件；普通用户不需要配置
4. 查看后端控制台输出的错误信息

### Q: WebSocket 连接断开？

A: 系统具有自动重连机制：
- 首次重连延迟 1 秒
- 最大重连延迟 30 秒
- 最多尝试重连 10 次
- 确保后端服务在运行中

### Q: 如何添加自定义 AI 提供商？

A:
1. 点击顶栏 ⚙ 进入设置 → Provider 标签
2. 点击 **+ Add** 按钮
3. 输入 Provider ID（小写字母+数字+下划线，如 `groq`）、名称和 Base URL
4. 点击 Add 创建后，可在编辑区配置 API Key 和模型
5. 自定义提供商可随时删除（内置的 4 家不可删除）

### Q: 数据库文件在哪里？如何备份？

A:
- SQLite 数据库文件位于 `~/.cyberpal-cockpit/cpc.db`
- 备份方法：直接复制该文件即可
- 使用 MySQL 时，使用标准 MySQL 备份工具

### Q: Token 预算是如何计算的？

A:
- Token 用量从 Agent 的运行输出中实时估算
- 按月度周期累计（每月 1 日重置）
- 可通过 Budget 面板查看详细按 Agent/按工作区的统计

### Q: 多个 Agent 修改同一文件会发生什么？

A: 系统内置冲突检测机制：
- 在 60 秒窗口内，两个 Agent 对同一文件的操作会被标记为冲突
- 冲突信息以 Toast 提示显示在页面顶部
- 建议为不同 Agent 分配不同的工作区以避免冲突

---

## 7. 技术支持

如有问题，请通过以下方式获取帮助：

- 查看 `docs/` 目录下的设计文档
- 检查后端控制台日志获取错误信息
