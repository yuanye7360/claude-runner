# PR Review 併發執行設計

## 問題

PR review 後端使用 `for` 迴圈循序執行，但前端 UI 以平行佈局呈現所有 PR，造成 UX 不一致。使用者無法分辨哪個 PR 正在執行、哪個在排隊。

## 目標

1. 後端改為真正併發執行 PR review，併發上限 5
2. 前端 UI 明確區分「執行中」vs「排隊中」的 PR

## 設計

### 後端：併發池（`pr-review/run.post.ts`）

#### 併發控制

使用 `p-limit(5)` 或手寫 concurrency pool 取代目前的 `for` 迴圈：

```
toReview.map(pr => limit(() => reviewOnePr(pr)))
```

- 最多同時執行 5 個 Claude CLI process
- 超過 5 個的 PR 自動排隊，slot 空出後立即填入
- 用 `Promise.allSettled` 等待全部完成，確保單一 PR 失敗不影響其他

#### 佇列狀態事件

新增 phase 0 表示排隊中：

```typescript
const PHASES = [
  { phase: 0, label: '排隊中' },       // 新增
  { phase: 1, label: '分析 PR' },
  { phase: 2, label: 'Review 中', pattern: /gh pr comment|gh pr review|gh api.*pulls.*comments/i },
  { phase: 3, label: '完成', pattern: /REVIEW_RESULT:/i },
];
```

- PR 建立時立即推送 `phase: 0, label: '排隊中'`
- PR 進入 pool 開始執行時推送 `phase: 1, label: '分析 PR'`

#### job.kill 改為多 process 追蹤

目前 `job.kill` 每次被單一 child 覆蓋（bug），改為：

```typescript
const activeChildren: Set<ChildProcess> = new Set();
job.kill = () => activeChildren.forEach(c => c.kill());
```

每個 spawn 加入 set，exit 後移除。

#### results / pendingReviews 收集

JS 單線程，`await` 交界點之間不會有 race condition。`Promise.allSettled` 結束後統一處理 `pendingReviews` 寫入 DB，邏輯不變。

### 前端：狀態區分（`RunnerJobProgress.vue`）

#### Phase 0：排隊中

- 灰色文字 + 等待 icon（例如時鐘或灰色圓點）
- 不展開 log 區塊
- Phase dots 全部顯示為空心（○ ○ ○）

#### Phase 1-3：執行中

- 現有行為不變：藍色/綠色 phase dots，展開 streaming log

#### 視覺順序

- 執行中的 PR 排在上方
- 排隊中的 PR 排在下方，收合顯示
- 完成/失敗的 PR 按完成時間排列

### `useRunnerJob.ts` 調整

- 識別 phase 0 事件，設定 issue 狀態為 `queued`
- 新增 `queued` 狀態到 per-issue phase tracking

## 不需要改的

- SSE streaming：已支援 per-issue 的 `issueKey` 路由，併發時自然分流
- 去重邏輯：不變
- Phase detection 函式：不變，每個 PR 獨立追蹤
- Dashboard / History 頁面：不受影響

## 依賴

- `p-limit` package（或手寫等效邏輯，避免多一個依賴）

## 影響範圍

| 檔案 | 改動 |
|------|------|
| `server/api/pr-review/run.post.ts` | 併發池 + phase 0 + job.kill 修正 |
| `components/RunnerJobProgress.vue` | 排隊中 UI 狀態 |
| `composables/useRunnerJob.ts` | phase 0 / queued 狀態處理 |
