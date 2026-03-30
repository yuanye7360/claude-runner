# ClaudeRunner UI 重構：側邊欄 + 賽博霓虹風格

## Overview

將 ClaudeRunner 從頂部 Tab 切換佈局改為側邊欄導航，同時將整體視覺風格從現有的灰色暗黑主題升級為賽博霓虹（Cyberpunk Neon）科技風。

## Design Decisions

### 佈局結構

**側邊欄（展開式，可收合）**
- 展開寬度：220px，顯示圖標 + 文字標籤 + 分組標題
- 收合寬度：60px，僅顯示圖標 + badge 數字，hover 顯示 tooltip
- 收合/展開透過側邊欄內的按鈕切換，狀態持久化至 localStorage

**側邊欄區域劃分**
- 頂部：Logo + 「Smart/Normal」模式切換 toggle
- 中部：導航項目，分三組
- 底部：字體大小選擇、Settings 入口

**導航分組**

| 分組 | 項目 | 對應路由 |
|------|------|----------|
| Pipeline | JIRA Runner | `/` 或 `/jira-runner` |
| Pipeline | PR Runner | `/pr-runner` |
| Pipeline | PR Review | `/pr-review` |
| Analytics | Dashboard | `/dashboard` |
| Settings | Repos | `/repos` |
| Settings | Skills | `/skills` |

- Job Detail (`/jobs/[id]`) 不在導航中，由 Pipeline 頁面內的 issue 行點擊進入
- 現有 `/claude-runner` 頁面合併至 JIRA Runner 頁面

**主內容區**
- 佔據側邊欄右側的全部剩餘寬度
- 當側邊欄收合時，內容區自動擴展

### 視覺風格：賽博霓虹

**色彩系統**

| 角色 | 色值 | 用途 |
|------|------|------|
| 基底背景 | `#0c0c1d` → `#111128` (gradient) | 頁面背景 |
| 側邊欄背景 | `rgba(15,15,35,0.97)` | 側邊欄面板 |
| 主紫色 | `#8b5cf6` | 主色調、active 狀態、logo 漸層起點 |
| 輔助青色 | `#06b6d4` | 輔助強調、logo 漸層終點 |
| 成功綠 | `#22c55e` | 完成/成功狀態 |
| 警告橙 | `#f59e0b` | 失敗/警告狀態 |
| 主文字 | `#e0e7ff` | 標題、重要文字 |
| 次文字 | `#c4b5fd` | Active 項目文字 |
| 暗文字 | `#4c4c6d` | Inactive 項目、說明文字 |
| 邊框 | `rgba(139,92,246,0.12~0.2)` | 容器邊框、分隔線 |

**霓虹發光效果**
- Active 圖標/指示燈：`box-shadow: 0 0 8px` 配對應顏色
- Logo：`box-shadow: 0 0 20px rgba(139,92,246,0.35)`
- KPI 數字：`text-shadow: 0 0 12px` 配對應顏色的 0.3 透明度
- 頁面背景：微妙的 radial-gradient 光暈（紫色、青色）

**Active 導航項樣式**
- 背景：`linear-gradient(90deg, rgba(139,92,246,0.12), transparent)`
- 左邊框：`border-left: 2px solid #8b5cf6`
- 圓角：`border-radius: 10px`

**圓角規範**
- 大容器（卡片、面板、Issue 列表）：`border-radius: 14-16px`
- 中元素（導航項、輸入框）：`border-radius: 10px`
- 小元素（Badge、按鈕、Tag）：`border-radius: 6-8px`

### 組件變更

**新增組件**
- `AppSidebar.vue` — 側邊欄主組件，包含導航、分組、收合邏輯
- `SidebarNavItem.vue` — 導航項組件（圖標 + 文字 + optional badge）
- `SidebarNavGroup.vue` — 導航分組標題

**修改組件**
- `app.vue` — 移除 `<NuxtLayout>`，改為 sidebar + main content 的 flex 佈局
- `pages/index.vue` — 移除 Tab 切換邏輯，拆分為三個獨立頁面
- 所有頁面 — 移除各自的 header/導航元素，只保留內容區

**移除/重構**
- 頂部 Tab 導航（UTabs 相關）
- `pages/index.vue` 中的三合一 Tab 結構
- 現有 header 中的模式切換和設定按鈕（移入側邊欄）

**保持不變**
- 各功能區的核心業務組件（JiraIssueList、RunnerJobProgress 等）
- 所有 composables
- Dashboard 圖表和 KPI 組件
- OnboardingChecklist（浮動組件，不受佈局影響）

### CSS/Theme 變更

在 `main.css` 中新增賽博霓虹主題的 CSS 變數：

```css
:root {
  --bg-base: #0c0c1d;
  --bg-base-end: #111128;
  --bg-sidebar: rgba(15, 15, 35, 0.97);
  --color-primary: #8b5cf6;
  --color-accent: #06b6d4;
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-text: #e0e7ff;
  --color-text-active: #c4b5fd;
  --color-text-muted: #4c4c6d;
  --border-glow: rgba(139, 92, 246, 0.15);
  --radius-lg: 16px;
  --radius-md: 10px;
  --radius-sm: 8px;
}
```

Nuxt UI 的 `app.config.ts` 需覆寫預設的 color tokens 以配合新色系。

### 路由結構變更

| 現有路由 | 新路由 | 說明 |
|----------|--------|------|
| `/` (tabs) | `/jira-runner` | JIRA Runner 獨立頁面 |
| `/` (tabs) | `/pr-runner` | PR Runner 獨立頁面（已存在） |
| `/` (tabs) | `/pr-review` | PR Review 獨立頁面 |
| `/dashboard` | `/dashboard` | 不變 |
| `/repos` | `/repos` | 不變 |
| `/skills` | `/skills` | 不變 |
| `/jobs/[id]` | `/jobs/[id]` | 不變 |
| `/claude-runner` | 移除 | 合併至 `/jira-runner` |
| `/` | redirect → `/jira-runner` | 首頁重導向 |

### 動畫與過場

- 側邊欄收合/展開：CSS transition `width 200ms ease`，文字 fade out/in
- 頁面切換：Nuxt 內建 page transition，淡入效果
- Hover 效果：導航項 hover 時背景漸變 + 文字亮度提升
- 不添加過度花俏的動畫，保持操作流暢

### 響應式行為

- >= 1024px：側邊欄預設展開
- < 1024px：側邊欄預設收合為圖標模式
- 用戶手動切換的偏好優先於預設行為（localStorage 持久化）

## Scope

**包含：**
- 側邊欄佈局實作
- 賽博霓虹主題色彩系統
- 路由重構（Tab → 獨立頁面）
- 圓角規範統一
- 收合/展開功能 + 持久化

**不包含：**
- 各功能頁面內部的業務邏輯變更
- API / composable 層修改
- 新功能添加
- 後端變更

## Technical Notes

- 使用 Nuxt UI v4 的 theming system 覆寫色彩 tokens
- 側邊欄收合狀態用 `useState` + localStorage 持久化
- 導航項的 active 狀態由 `useRoute()` 驅動
- CSS 變數定義在 `main.css`，Tailwind 的 `theme.extend` 中引用
- 所有霓虹發光效果通過 Tailwind 的 `shadow` 和自定義 utility 實現
