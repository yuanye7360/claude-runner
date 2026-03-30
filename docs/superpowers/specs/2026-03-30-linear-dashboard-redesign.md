# ClaudeRunner UI v2：Linear 風格 Dashboard 首頁 + ⌘K 快切

## Overview

對現有側邊欄 + 賽博霓虹 UI 進行第二輪改造。解決三個核心問題：導航項目平均沒重點、缺少上下文（看不到待處理數量）、切換成本高。改為 Linear 風格的極簡美學，以 Dashboard 為首頁，搭配 Command Palette 快速跳轉。

## Design Decisions

### 視覺風格：Linear 極簡

**色彩系統**

| 角色 | 色值 | 用途 |
|------|------|------|
| 基底背景 | `#0a0a0f` | 頁面背景（純黑，不再用漸層） |
| 側邊欄背景 | `#0a0a12` | 側邊欄，比頁面稍深一點 |
| 表面 | `rgba(255,255,255,0.02)` | 卡片、列表行背景 |
| 表面 hover | `rgba(255,255,255,0.04)` | 互動元素 hover |
| 邊框 | `rgba(255,255,255,0.06)` | 主要邊框，極淡 |
| 邊框 hover | `rgba(255,255,255,0.08)` | 邊框 hover / active |
| 主文字 | `#fafafa` | 標題、數字 |
| 次文字 | `#888` | 標籤、說明 |
| 暗文字 | `#444` | 時間戳、禁用狀態 |
| JIRA 語義色 | `#8b5cf6` | JIRA Runner 相關 |
| PR 語義色 | `#06b6d4` | PR Runner 相關 |
| Review 語義色 | `#22c55e` | Code Review 相關 |
| 警告色 | `#f59e0b` | 錯誤/警告狀態 |

**設計原則**
- 不用霓虹發光（`box-shadow` glow 全部移除）
- 不用漸層背景（頁面背景改為純色 `#0a0a0f`）
- 邊框極細極淡（`rgba(255,255,255,0.06)`）
- 語義色只用在小面積元素（badge、進度條、狀態點），不用在大面積背景
- 字體：Inter，數字用 `tabular-nums` + `letter-spacing: -0.5px`
- 圓角統一：卡片 10px、按鈕/badge 8px、小元素 6px

### 佈局結構

**側邊欄（52px 純圖標）**
- 固定 52px 寬，不可展開（移除展開/收合功能）
- 頂部：Logo（漸層圖標）
- 中部：導航圖標，每個帶 badge 數字
  - 🏠 首頁（Dashboard）— active 時有淡背景
  - 🐛 JIRA Runner — badge 顯示待處理 issue 數
  - 🔀 PR Runner — badge 顯示待處理 PR 數
  - 👁 Code Review — badge 顯示待 review PR 數
- 底部：⚙️ Settings（進入 Repos/Skills 設定頁）
- Hover 效果：圖標背景變亮 + tooltip 顯示名稱
- Active 狀態：`rgba(255,255,255,0.06)` 背景 + `rgba(255,255,255,0.08)` 邊框

**頂部 Header（48px）**
- 左側：頁面標題
- 右側：⌘K 搜尋框（觸發 Command Palette）+ 字體大小 + 使用指引 + RepoManager

**主內容區**
- 佔據側邊欄右側全部剩餘寬度

### Dashboard 首頁

Dashboard 取代原來的 JIRA Runner 作為預設首頁（`/` → Dashboard）。

**三張狀態卡片**
- 每張卡片代表一個功能：JIRA Issues / PR Runner / Code Review
- 顯示：標題、待處理數量（大字號）、細分狀態、進度條
- 點擊卡片 → 跳轉到對應功能頁
- 卡片邊框使用對應的語義色（極淡 4% 背景 + 10% 邊框）
- Hover 時邊框提亮

**Recent Activity 區域**
- 顯示最近的任務動態（最新 10 條）
- 每條顯示：狀態點（顏色）+ 描述 + 時間
- 資料來源：現有的 `/api/claude-runner/jobs` API
- Running 狀態的任務有 pulse 動畫

**Dashboard 數據來源**
- 狀態卡片的數量需要從各功能的 API 即時取得
- JIRA Issues 數量：從 JIRA API（現有 `useJiraRunner` composable）
- PR Runner 數量：從現有 PR 列表 API
- Code Review 數量：從現有 PR Review 列表 API
- Recent Activity：從 `/api/claude-runner/jobs?limit=10`

### Command Palette（⌘K）

**功能**
- 全局快捷鍵 `⌘K`（Mac）/ `Ctrl+K`（Windows）觸發
- 模態彈窗，搜尋框自動 focus
- 搜尋範圍：頁面導航 + 最近的 issue/PR

**搜尋項目**
- 固定導航項：Dashboard、JIRA Runner、PR Runner、Code Review、Repos、Skills
- 動態項：最近的 JIRA issues（by key 或 summary）
- 動態項：最近的 PR（by title 或 number）

**UI 規格**
- 背景遮罩：`rgba(0,0,0,0.6)` + `backdrop-filter: blur(4px)`
- 彈窗：寬 480px、`#0a0a12` 背景、`rgba(255,255,255,0.08)` 邊框、圓角 12px
- 搜尋框：48px 高、`#fafafa` 文字、placeholder 為 `#444`
- 結果列表：每項 40px 高，hover 背景 `rgba(255,255,255,0.04)`
- 鍵盤操作：↑↓ 選擇、Enter 確認、Esc 關閉
- 結果分組：「導航」「最近 Issues」「最近 PRs」

### 路由結構變更

| 現有路由 | 新路由 | 說明 |
|----------|--------|------|
| `/` → redirect `/jira-runner` | `/` → Dashboard 首頁 | 首頁改為 Dashboard |
| `/dashboard` | 移除（合併到 `/`） | Dashboard 就是首頁 |
| `/jira-runner` | `/jira-runner` | 不變 |
| `/pr-runner` | `/pr-runner` | 不變 |
| `/pr-review` | `/pr-review` | 不變 |
| `/repos` | `/settings/repos` | 移入 Settings 子路由 |
| `/skills` | `/settings/skills` | 移入 Settings 子路由 |
| `/jobs/[id]` | `/jobs/[id]` | 不變 |

### 組件變更

**新增組件**
- `CommandPalette.vue` — ⌘K 模態搜尋彈窗
- `DashboardHome.vue` — 首頁內容：狀態卡片 + Recent Activity
- `StatusCard.vue` — 單張狀態卡片（標題、數量、細分、進度條、語義色）

**修改組件**
- `AppSidebar.vue` — 改為 52px 純圖標版，加 badge 數字，移除展開/收合
- `SidebarNavItem.vue` — 簡化為純圖標 + badge，移除文字標籤
- `app.vue` — 加入 CommandPalette、更新色彩系統、badge 數據取得
- `pages/index.vue` — 改為 Dashboard 首頁（不再 redirect）

**移除組件**
- `SidebarNavGroup.vue` — 不再需要分組標題
- `useSidebar.ts` — 不再需要展開/收合邏輯

**保持不變**
- 所有 Tab 組件（JiraRunnerTab、PrRunnerTab、PrReviewerTab）
- 所有 composables
- 功能頁面內部邏輯

### 結構化 Job 執行詳情

現有的 `jobs/[id].vue` 頁面把 AI 的 output 當純文字顯示，難以閱讀。改為結構化的階段式展示。

**數據基礎**
- 系統已有 `PhaseInfo`（`phase` + `label` + `status`）和 `outputByIssue`
- 每個 issue 的執行分為動態 phases（如「分析 & 建立分支」→「實作修復」→「建立 PR」）
- `output` 純文字需要解析為結構化區塊

**階段式展示**

每個 Issue 的執行結果改為時間線卡片，每張卡片對應一個 phase：

```
┌─ Phase 1: 分析 & 建立分支 ✅ ──────────────────┐
│  • 理解 issue：repay 取付款頻道參數格式錯誤      │
│  • 建立分支：task/KB2CW-3394-fix-repay-params   │
│  • 影響範圍：1 個檔案                            │
└─────────────────────────────────────────────────┘
┌─ Phase 2: 實作修復 ✅ ─────────────────────────┐
│  • 修改 app/Controllers/Repay.php               │
│  • 變更：修正頻道參數序列化格式                    │
│  [展開查看完整 diff]                             │
└─────────────────────────────────────────────────┘
┌─ Phase 3: 建立 PR ✅ ──────────────────────────┐
│  • PR #142: Fix repay channel params format     │
│  • [查看 PR →]                                  │
└─────────────────────────────────────────────────┘
```

**UI 規格**
- 時間線佈局：左側有一條垂直線連接各 phase
- Phase 狀態圖標：✅ done（綠）、⏳ running（紫，pulse 動畫）、○ pending（灰）
- Phase 標題：`label` + 狀態 badge
- Phase 內容：從 `output` / `outputByIssue` 解析出的關鍵資訊
- 每個 phase 可展開/收合，預設只顯示摘要
- 錯誤的 phase 用紅色邊框 + 錯誤訊息

**Output 解析策略**
- output 是 AI agent 的純文字日誌，需要前端解析
- 按 phase 分割：用 `phases` 數據對應 `output` 中的段落
- 關鍵資訊提取：檔案路徑、分支名稱、PR URL 用正則匹配並高亮
- 未能解析的部分放在「完整 Log」可展開區域

**新增組件**
- `JobPhaseTimeline.vue` — 單個 issue 的 phase 時間線
- `JobPhaseCard.vue` — 單個 phase 卡片（狀態圖標、標題、內容、展開/收合）

### 動畫

- 頁面切換：Nuxt page transition `opacity 150ms ease`
- Command Palette：彈窗 `opacity + scale 150ms ease`
- 狀態卡片 hover：`border-color 150ms ease`
- Running 狀態：`pulse` 動畫（現有）
- 不添加花俏動畫，所有動畫 ≤ 200ms

## Scope

**包含：**
- 側邊欄改為 52px 純圖標 + badge
- Dashboard 首頁（狀態卡片 + Recent Activity）
- Command Palette（⌘K）
- Linear 色彩系統替換
- 路由調整（Dashboard 為首頁、Settings 子路由）
- 結構化 Job 執行詳情（phase 時間線卡片）

**不包含：**
- 功能頁面內部邏輯變更
- API 新增（用現有 API）
- 後端變更
- 行動裝置適配
