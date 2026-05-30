# UI Design System — CyberPal Cockpit

> 版本：v1.0 | 日期：2026-05-30
> 设计参考：Warp Terminal 官网（现代科技感 + 工具实用主义）
> 使用说明：本文档是 CyberPal Cockpit 前端的**权威设计依据**，所有组件开发、样式调整均以本文档为准。

---

## 一、设计哲学

### 核心原则

1. **系统化的设计决策** — 每个视觉元素都有明确的数值依据，不凭感觉调色
2. **低饱和度冷色调** — 护眼、专业，符合开发者工具定位
3. **克制的动效** — 过渡服务于可用性，不炫技
4. **信息层级优先** — 通过字号、字重、颜色的梯度建立清晰的视觉层次
5. **适配双主题** — 浅色/深色模式使用同一套设计令牌（Design Tokens），通过 CSS 变量切换

### 设计语言关键词

`现代科技感` · `工具实用主义` · `冷灰 + 靛蓝` · `等宽字体优先` · `微妙的阴影与边框`

---

## 二、配色系统

### 2.1 浅色模式（Light）

| 令牌名 | RGB 值 | 十六进制 | 用途 |
|--------|---------|----------|------|
| `--color-bg` | 247 248 250 | #F7F8FA | 页面最底层背景 |
| `--color-surface` | 255 255 255 | #FFFFFF | 卡片、面板、弹窗底色 |
| `--color-surface-hover` | 240 241 243 | #F0F1F3 | 悬浮/激活态表面色 |
| `--color-surface-sunken` | 235 237 241 | #EBEDF1 | 凹陷区域（输入框内部、终端背景） |
| `--color-border` | 228 231 235 | #E4E7EB | 默认边框 |
| `--color-border-strong` | 200 205 212 | #C8CDD4 | 强调型边框（聚焦环等） |
| `--color-text` | 26 32 44 | #1A202C | 主文字 |
| `--color-text-secondary` | 107 124 147 | #6B7C93 | 次要文字、说明文案 |
| `--color-text-placeholder` | 160 170 185 | #A0AAB9 | 占位文字 |
| `--color-accent` | 99 102 241 | #6366F1 | 品牌色/主强调色（Indigo 500） |
| `--color-accent-hover` | 79 70 229 | #4F46E5 | 强调色 hover 态（Indigo 600） |
| `--color-accent-subtle` | 224 231 255 | #E0E7FF | 强调色浅底（Indigo 50） |
| `--color-success` | 16 185 129 | #10B981 | 成功状态（Emerald 500） |
| `--color-success-subtle` | 209 250 229 | #D1FAE5 | 成功浅底（Emerald 50） |
| `--color-warning` | 245 158 11 | #F59E0B | 警告状态（Amber 500） |
| `--color-warning-subtle` | 254 243 199 | #FEF3C7 | 警告浅底（Amber 50） |
| `--color-danger` | 239 68 68 | #EF4444 | 危险状态（Red 500） |
| `--color-danger-subtle` | 254 226 226 | #FEE2E2 | 危险浅底（Red 50） |

### 2.2 深色模式（Dark）

| 令牌名 | RGB 值 | 十六进制 | 用途 |
|--------|---------|----------|------|
| `--color-bg` | 15 17 23 | #0F1117 | 页面最底层背景（深灰蓝，非纯黑） |
| `--color-surface` | 26 31 46 | #1A1F2E | 卡片、面板、弹窗底色 |
| `--color-surface-hover` | 35 41 56 | #232938 | 悬浮/激活态表面色 |
| `--color-surface-sunken` | 20 24 36 | #141828 | 凹陷区域 |
| `--color-border` | 45 53 72 | #2D3548 | 默认边框 |
| `--color-border-strong` | 75 85 105 | #4B5569 | 强调型边框 |
| `--color-text` | 201 209 217 | #C9D1D9 | 主文字 |
| `--color-text-secondary` | 139 148 158 | #8B949E | 次要文字 |
| `--color-text-placeholder` | 90 100 115 | #5A6473 | 占位文字 |
| `--color-accent` | 129 140 248 | #818CF8 | 品牌色（Indigo 400，提亮以适配深色） |
| `--color-accent-hover` | 165 180 252 | #A5B4FC | 强调色 hover 态（Indigo 300） |
| `--color-accent-subtle` | 49 57 89 | #313959 | 强调色浅底（深 Indigo） |
| `--color-success` | 52 211 153 | #34D399 | 成功状态 |
| `--color-success-subtle` | 20 55 44 | #14372C | 成功浅底 |
| `--color-warning` | 251 191 36 | #FBBF24 | 警告状态 |
| `--color-warning-subtle` | 60 48 10 | #3C300A | 警告浅底 |
| `--color-danger` | 248 113 113 | #F87171 | 危险状态 |
| `--color-danger-subtle` | 70 20 25 | #46141A | 危险浅底 |

### 2.3 使用规范

```css
/* ✅ 正确：通过 CSS 变量引用 */
background-color: rgb(var(--color-surface));
color: rgb(var(--color-text));
border-color: rgb(var(--color-border));

/* ❌ 错误：硬编码颜色值 */
background-color: #FFFFFF;
color: #1A202C;
```

```html
<!-- ✅ 正确：Tailwind 通过 rgb() 变量使用 -->
<div class="bg-cockpit-bg text-cockpit-text border-cockpit-border">

<!-- ❌ 错误：直接写 Tailwind 内置色 -->
<div class="bg-white text-gray-900 border-gray-200">
```

---

## 三、字体系统

### 3.1 字体引入（必须执行）

```bash
# 无衬线字体（UI 文字）
npm install @fontsource-variable/inter

# 等宽字体（代码/终端）
npm install @fontsource-variable/cascadia-code
```

```typescript
// main.ts 中引入（必须）
import '@fontsource-variable/inter/wght-normal.css';
import '@fontsource-variable/cascadia-code/wght-normal.css';
```

### 3.2 字体族定义

| 用途 | 字体栈 | Tailwind 配置键 |
|------|--------|-----------------|
| UI 文字（无衬线） | `'Inter Variable', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` | `fontFamily.sans` |
| 代码/终端（等宽） | `'Cascadia Code Variable', 'Fira Code', 'JetBrains Mono', ui-monospace, monospace` | `fontFamily.mono` |

### 3.3 Variable Font 特性

Inter Variable 支持以下 `font-variation-settings`：

| 特性标签 | 含义 | 取值范围 | 使用场景 |
|----------|------|----------|----------|
| `wght` | 字重 | 100–900 | 所有文字 |
| `slnt` | 斜体倾斜度 | 0–10 | 强调文字（少用） |

```css
/* 在 index.css 中全局启用 */
font-variation-settings: 'wght' var(--font-weight, 400);
```

---

## 四、视觉尺度体系

### 4.1 圆角（Border Radius）

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--radius-sm` | 6px | 小标签、输入框、按钮（小） |
| `--radius-md` | 10px | 卡片、中等按钮、下拉菜单 |
| `--radius-lg` | 16px | 大型面板、弹窗、Hero 区 |
| `--radius-full` | 9999px | 头像、Badge、Pill 按钮 |

### 4.2 阴影（Box Shadow）

| 令牌 | 值 | 用途 |
|------|-----|------|
| `--shadow-xs` | `0 1px 2px rgba(0,0,0,0.04)` | 分隔线替代（微妙浮起） |
| `--shadow-sm` | `0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)` | 卡片默认状态 |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04)` | 卡片 hover / 下拉菜单 |
| `--shadow-lg` | `0 10px 25px rgba(0,0,0,0.08)` | 弹窗、Command Palette |
| `--shadow-accent` | `0 0 0 3px rgba(99,102,241,0.25)` | 聚焦环（浅色模式） |
| `--shadow-accent-dark` | `0 0 0 3px rgba(129,140,248,0.35)` | 聚焦环（深色模式） |

深色模式下阴影需要**加亮而不是加暗**：

```css
[data-theme="dark"] {
  --shadow-sm: 0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.3), 0 2px 4px rgba(0,0,0,0.2);
  --shadow-lg: 0 10px 25px rgba(0,0,0,0.4);
}
```

### 4.3 间距（Spacing）

遵循 Tailwind 默认间距尺度（4 的倍数），额外增加 3px 微调档：

| 令牌 | 值 | 用途 |
|------|-----|------|
| `0.5` | 2px | 极小间隙 |
| `1` | 4px | 紧凑元素间距 |
| `1.5` | 6px | 图标与文字间距 |
| `2` | 8px | 常规元素间距 |
| `3` | 12px | 卡片内部 padding |
| `4` | 16px | 组件间距 |
| `5` | 20px | 区块间距 |
| `6` | 24px | 大区块间距 |
| `8` | 32px | 模块间距 |
| `10` | 40px | 页面边距 |
| `12` | 48px | 大留白 |
| `16` | 64px | 超大留白 |

---

## 五、字体排版尺度（Type Scale）

### 5.1 标题层级

| 类名 | 字号 | 行高 | 字间距 | 字重 | 用途 |
|------|------|------|--------|------|------|
| `.type-display` | 36px | 1.1 | -0.02em | 800（Extrabold） | Hero 区主标题 |
| `.type-hero` | 28px | 1.2 | -0.019em | 700（Bold） | 页面主标题 |
| `.type-title` | 22px | 1.3 | -0.019em | 600（Semibold） | 区块标题、卡片标题 |
| `.type-heading` | 18px | 1.35 | -0.014em | 600（Semibold） | 子标题、分组标题 |
| `.type-subheading` | 16px | 1.4 | -0.011em | 500（Medium） | Agent 名称、功能标签 |

### 5.2 正文层级

| 类名 | 字号 | 行高 | 字间距 | 字重 | 用途 |
|------|------|------|--------|------|------|
| `.type-body` | 14px | 1.5 | -0.011em | 400（Regular） | 正文默认 |
| `.type-body-sm` | 13px | 1.5 | -0.006em | 400（Regular） | 辅助说明、列表项 |
| `.type-body-xs` | 12px | 1.5 | 0em | 400（Regular） | 表格文字、时间戳 |

### 5.3 标签/标注层级

| 类名 | 字号 | 行高 | 字间距 | 字重 | 用途 |
|------|------|------|--------|------|------|
| `.type-label` | 12px | 1.5 | 0.04em | 600（Semibold） | 表单标签、分区标签 |
| `.type-caption` | 11px | 1.4 | 0.01em | 500（Medium） | 图片标注、底部说明 |
| `.type-overline` | 11px | 1.4 | 0.08em | 700（Bold） | 分区大写标签 |

### 5.4 等宽字体层级（代码/终端）

| 类名 | 字号 | 用途 |
|------|------|------|
| `.type-mono` | 13px | 终端输出、代码块 |
| `.type-mono-sm` | 11px | 状态栏、紧凑代码 |
| `.type-mono-lg` | 14px | 编辑器内容 |

---

## 六、组件设计规范

### 6.1 按钮（Button）

| 变体 | 背景 | 文字 | 边框 | Hover | Active |
|------|------|------|------|-------|--------|
| Primary | `accent` | 白色 | 无 | `accent-hover` | `accent` 加深 10% |
| Secondary | 透明 | `text` | `border` | `surface-hover` | `surface-sunken` |
| Danger | `danger` | 白色 | 无 | `danger` 加深 10% | — |
| Ghost | 透明 | `text-secondary` | 无 | `surface-hover` | `surface-sunken` |

**通用规范**：
- 圆角：`--radius-sm`（6px）
- 字号：`13px`，字重 `500`
- 内边距：`6px 14px`（小），`8px 18px`（中），`10px 24px`（大）
- 过渡：`all 150ms cubic-bezier(0.4, 0, 0.2, 1)`
- 禁用态： opacity `0.5`，禁止 hover 效果

### 6.2 输入框（Input）

| 状态 | 边框 | 背景 | 阴影 |
|------|------|------|------|
| 默认 | `border` | `surface` | 无 |
| Focus | `accent` | `surface` | `shadow-accent` |
| Error | `danger` | `surface` | `0 0 0 3px rgba(239,68,68,0.25)` |
| Disabled | `border` | `surface-sunken` | 无 |

**规范**：
- 圆角：`--radius-sm`
- 字号：`13px`，字族：`mono`（代码输入场景）
- 内边距：`7px 12px`
- 过渡：`border-color 150ms, box-shadow 150ms`

### 6.3 卡片（Card / AgentCell）

| 状态 | 边框 | 背景 | 阴影 | Hover 效果 |
|------|------|------|------|----------|
| 默认 | `border` | `surface` | `shadow-sm` | `shadow-md` + `translateY(-1px)` |
| 选中 | `accent` | `surface` | `shadow-md` + `shadow-accent` | — |
| 运行中 | `accent` 动画呼吸 | `surface` | `shadow-md` | — |

**规范**：
- 圆角：`--radius-md`（10px）
- 内边距：`16px`
- 运行中状态指示：左边缘 3px 强调色条 + 状态点脉冲动画

### 6.4 状态指示点（Status Badge）

| 状态 | 颜色 | 动画 |
|------|------|------|
| 运行中（running） | `accent` | 脉冲呼吸（2s 循环） |
| 空闲（idle） | `warning` | 无 |
| 停止（stopped） | `text-secondary` | 无 |
| 错误（error） | `danger` | 快速闪烁（1s 循环） |

脉冲动画实现：

```css
@keyframes pulse-ring {
  0%   { box-shadow: 0 0 0 0 rgba(var(--color-accent), 0.5); }
  70%  { box-shadow: 0 0 0 6px rgba(var(--color-accent), 0); }
  100% { box-shadow: 0 0 0 0 rgba(var(--color-accent), 0); }
}
.status-dot.running {
  animation: pulse-ring 2s ease-out infinite;
}
```

### 6.5 滚动条（Scrollbar）

| 属性 | 值 |
|------|-----|
| 宽度 | 4px（比当前 6px 更精致） |
| Track 背景 | 透明 |
| Thumb 颜色 | `border`（默认），`text-secondary`（hover） |
| Thumb 圆角 | 2px |
| Hover 效果 | Thumb 颜色变深 + 宽度扩展到 6px |

---

## 七、动画与过渡规范

### 7.1 全局过渡曲线

```css
/* 标准过渡 */
--ease-standard: cubic-bezier(0.4, 0, 0.2, 1);
/* 强调进入 */
--ease-decelerate: cubic-bezier(0, 0, 0.2, 1);
/* 强调退出 */
--ease-accelerate: cubic-bezier(0.4, 0, 1, 1);
```

### 7.2 过渡时长标准

| 交互类型 | 时长 | 曲线 |
|----------|------|------|
| 颜色/背景色变化 | 150ms | `ease-standard` |
| 阴影变化 | 200ms | `ease-standard` |
| 位移（hover 浮起） | 200ms | `ease-standard` |
| 展开/收起（accordion） | 300ms | `ease-standard` |
| 模态窗进入 | 250ms | `ease-decelerate` |
| 模态窗退出 | 200ms | `ease-accelerate` |

### 7.3 禁用动画的场景

- 用户设置了 `prefers-reduced-motion: reduce` → 所有非必要动画禁用
- 终端输出区域 → 不使用过渡动画（避免性能问题）

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 八、布局规范

### 8.1 面板布局常量

| 常量 | 值 | 说明 |
|------|-----|------|
| 左侧面板默认宽度 | 260px | 工作区树 |
| 左侧面板最小宽度 | 200px | — |
| 左侧面板最大宽度 | 400px | — |
| 右侧面板默认宽度 | 400px | Agent 详情 |
| 右侧面板最小宽度 | 300px | — |
| 右侧面板最大宽度 | 600px | — |
| Grid 最小单元宽度 | 400px | AgentCell 最小宽度 |
| Grid 间隙 | 12px | — |
| 页面内边距 | 16px | — |

### 8.2 响应式断点

| 断点 | 值 | 适配目标 |
|------|-----|----------|
| `sm` | 640px | 平板竖屏 |
| `md` | 768px | 平板横屏 |
| `lg` | 1024px | 小型桌面 |
| `xl` | 1280px | 标准桌面 |
| `2xl` | 1536px | 大屏 |

---

## 九、深色模式专项说明

### 9.1 与浅色模式的核心差异

| 差异点 | 浅色模式 | 深色模式 |
|--------|----------|----------|
| 背景深度 | 多层接近白色 | 多层接近黑色，但保持层次 |
| 阴影方向 | 向下投影 | 更依赖边框和**内发光**区分层次 |
| 强调色亮度 | Indigo 500 | Indigo 400（提亮） |
| 成功/警告/危险色 | 标准饱和度 | 提高亮度 15%（在深色背景上更可读） |
| 边框作用 | 次要（有阴影辅助） | 主要（替代阴影建立层次） |

### 9.2 深色模式禁止事项

- ❌ 使用纯黑（`#000000`）作为背景 — 缺乏层次
- ❌ 使用纯白（`#FFFFFF`）作为文字 — 刺眼，使用 `#C9D1D9`
- ❌ 直接反转浅色配色 — 需要重新计算对比度

---

## 十、交付检查清单（供 AI 开发参考）

每次完成一个组件的样式开发，按以下清单自查：

- [ ] 所有颜色引用均使用 `rgb(var(--color-xxx))` 形式，无硬编码色值
- [ ] 组件在浅色和深色模式下均经过视觉检查
- [ ] 交互状态（hover/active/focus/disabled）均有对应样式
- [ ] 过渡动画时长符合第七章规范
- [ ] 字体使用了正确的字体族（`sans` 用于 UI，`mono` 用于代码）
- [ ] 字号使用了第五章定义的类型尺度类名
- [ ] 圆角使用了 `--radius-*` 变量
- [ ] 滚动条样式已统一（4px 宽）
- [ ] `prefers-reduced-motion` 媒体查询已处理
- [ ] 组件间距使用第四章定义的间距尺度

---

## 附录：Tailwind 配置映射表

将上述设计令牌映射到 `tailwind.config.ts` 的 `theme.extend`：

```typescript
// colors → cockpit.*
// fontFamily → sans / mono
// fontSize → 见第五章，替换当前 fontSize 配置
// borderRadius → radius-sm / radius-md / radius-lg（需自定义）
// boxShadow → shadow-xs / shadow-sm / shadow-md / shadow-lg（需自定义）
// transitionDuration → 150 / 200 / 300（使用默认）
// transitionTimingFunction → 见第七章（需自定义）
```

---

*文档维护：当设计决策变更时，同步更新本文档和 `tailwind.config.ts` / `index.css`，保持三者一致。*
