# PR Review 併發執行設計

## 問題

PR review 後端使用 `for` 迴圈循序執行，但前端 UI 以平行佈局呈現所有 PR，造成 UX 不一致。使用者無法分辨哪個 PR 正在執行、哪個在排隊。

## 目標

1. 後端改為真正併發執行 PR review，併發上限 5
2. 前端 UI 明確區分「執行中」vs「排隊中」的 PR

## 設計

### 後端：併發池（`pr-review/run.post.ts`）

#### 併發控制

使用 `p-limit(5)` 取代目前的 `for` 迴圈：

```typescript
import pLimit from 'p-limit';

const limit = pLimit(5);

// 所有 PR 立即推送 phase 0（排隊中）
for (const pr of toReview) {
  pushPhase(job, 0, '排隊中', `#${pr.number}`);
}

const settled = await Promise.allSettled(
  toReview.map(pr => limit(async () => {
    if (job.status === 'cancelled') return null; // 排隊中被取消，直接跳過
    return reviewOnePr(pr);
  }))
);
```

- 最多同時執行 5 個 Claude CLI process
- 超過 5 個的 PR 自動排隊，slot 空出後立即填入
- 用 `Promise.allSettled` 等待全部完成，確保單一 PR 失敗不影響其他
- `finishJob` 在 `Promise.allSettled` 之後統一呼叫

#### 取消機制

循序模式用 `break` 中斷迴圈，併發模式需要兩段處理：

1. **排隊中的 PR**：pool function 開頭檢查 `job.status === 'cancelled'`，直接 return 跳過
2. **執行中的 PR**：透過 `job.kill()` 送 signal 給所有 active child processes

#### 佇列狀態事件

新增 phase 0 表示排隊中：

```typescript
const PHASES = [
  { phase: 0, label: '排隊中' },
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
const activeChildren: Set<ReturnType<typeof spawnClaude>> = new Set();
job.kill = () => activeChildren.forEach(c => c.kill());
```

每個 spawn 加入 set，exit 後移除。`finishJob` 只在 `Promise.allSettled` 完成後呼叫，不存在 kill 與 exit 的競爭。

#### fetchPrMeta 保持循序

`fetchPrMeta` 使用 `execSync`（阻塞 event loop），必須在併發池之前完成。目前的位置（第 115 行，`prNumbers.map(n => fetchPrMeta(...))`）已經在池之外，不需要改動。禁止將 fetchPrMeta 移入併發 pool function 內。

#### results / pendingReviews 收集

每個 `reviewOnePr` 回傳自己的結果物件，`Promise.allSettled` 之後統一收集到 `results` 和 `pendingReviews` 陣列。不再在 pool function 內直接 push 共用陣列。

```typescript
// settled 是 PromiseSettledResult[]
for (const r of settled) {
  if (r.status === 'fulfilled' && r.value) {
    results.push(r.value.result);
    if (r.value.review) pendingReviews.push(r.value.review);
  }
}
```

#### 全域 output 交錯

併發時 `pushChunk` 會交錯不同 PR 的輸出到全域 `job.output`。這是可接受的，因為前端主要使用 per-issue output 顯示（透過 SSE `issueKey` 路由）。全域 output 僅用於 fallback 和 debug。

### 前端：狀態區分（`RunnerJobProgress.vue`）

#### Phase 0：排隊中

- 灰色文字 + 等待 icon（例如時鐘或灰色圓點）
- 不展開 log 區塊
- Phase dots 全部顯示為空心（○ ○ ○）

#### Phase 1-3：執行中

- 現有行為不變：藍色/綠色 phase dots，展開 streaming log

#### 視覺順序

- 執行中的 PR（phase 1-3）排在上方
- 排隊中的 PR（phase 0）排在下方，收合顯示
- 完成/失敗的 PR 排在最下方

不需要追蹤完成時間戳——直接按 phase 分組排序即可。

### `useRunnerJob.ts` 調整

#### Phase 0 支援

`buildPhaseList` 需要支援 phase 0。呼叫 `startJob` 時傳入包含 phase 0 的 `dynamicPhases`：

```typescript
// 在 usePrReviewer.ts 呼叫 startJob 時
startJob(jobId, issues, {
  dynamicPhases: ['排隊中', '分析 PR', 'Review 中', '完成']
});
```

`buildPhaseList` 改為從 index 0 開始建立（而非目前的 `i + 1`）。

#### Per-issue 狀態

`applyPhase` 收到 phase 0 時設定 issue 狀態為 `queued`（新增狀態），phase >= 1 時設定為 `running`，現有的 `done` 邏輯不變。

## 不需要改的

- SSE streaming：已支援 per-issue 的 `issueKey` 路由，併發時自然分流
- 去重邏輯：不變
- Phase detection 函式：不變，每個 PR 獨立追蹤
- Dashboard / History 頁面：不受影響

## 依賴

- `p-limit` package（零依賴，4KB，處理 queue drain 和錯誤傳播的邊界情況）

## 影響範圍

| 檔案 | 改動 |
|------|------|
| `server/api/pr-review/run.post.ts` | 併發池 + phase 0 + 取消機制 + job.kill 修正 |
| `components/RunnerJobProgress.vue` | 排隊中 UI 狀態 + 分組排序 |
| `composables/useRunnerJob.ts` | phase 0 / queued 狀態 + buildPhaseList 調整 |
| `composables/usePrReviewer.ts` | startJob 傳入 dynamicPhases |
| `package.json` | 新增 `p-limit` 依賴 |
