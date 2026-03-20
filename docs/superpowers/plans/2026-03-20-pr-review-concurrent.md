# PR Review 併發執行 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將 PR review 從循序執行改為併發執行（上限 5），並讓前端 UI 區分「排隊中」與「執行中」的 PR。

**Architecture:** 後端用 `p-limit(5)` 建立併發池，每個 PR 獨立 spawn Claude CLI。前端新增 phase 0（排隊中）狀態，按 phase 分組排序顯示。

**Tech Stack:** p-limit, Nuxt 3/Nitro, Vue 3 composables

**Spec:** `docs/superpowers/specs/2026-03-20-pr-review-concurrent-design.md`

---

## File Structure

| 檔案 | 角色 | 改動類型 |
|------|------|---------|
| `apps/web/package.json` | 依賴管理 | 新增 `p-limit` |
| `apps/web/server/api/pr-review/run.post.ts` | PR review 後端邏輯 | 重構為併發池 |
| `apps/web/app/composables/useRunnerJob.ts` | Job 狀態管理 | 支援 phase 0 |
| `apps/web/app/composables/usePrReviewer.ts` | PR review 業務邏輯 | 傳入 dynamicPhases |
| `apps/web/app/components/RunnerJobProgress.vue` | 執行進度 UI | 排隊中狀態 + 分組排序 |

---

### Task 1: 安裝 p-limit

**Files:**
- Modify: `apps/web/package.json`

- [ ] **Step 1: 安裝 p-limit**

```bash
cd apps/web && pnpm add p-limit
```

- [ ] **Step 2: 確認安裝成功**

Run: `cd apps/web && node -e "import('p-limit').then(m => console.log(typeof m.default))"`
Expected: `function`

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json pnpm-lock.yaml
git commit -m "chore: add p-limit dependency for concurrent PR review"
```

---

### Task 2: 重構後端為併發池

**Files:**
- Modify: `apps/web/server/api/pr-review/run.post.ts`

- [ ] **Step 1: 抽出 `reviewOnePr` 函式**

將目前 `for` 迴圈內（第 190-372 行）的邏輯抽取成獨立函式，回傳結構化結果而非直接 push 共用陣列。

定義回傳型別和函式簽名：

```typescript
interface ReviewOnePrResult {
  result: RunResult;
  review?: {
    blockers: number;
    commitSha: string;
    majors: number;
    minors: number;
    prAuthor: string;
    prNumber: number;
    prTitle: string;
    suggestions: number;
    summaryComment: null | string;
  };
}

async function reviewOnePr(
  pr: PrMeta,
  ctx: {
    activeChildren: Set<{ kill: () => void }>;
    ansiRe: RegExp;
    cleanEnv: Record<string, string>;
    cwd: string;
    ghRepo: string;
    job: Job;
  },
): Promise<ReviewOnePrResult | null> {
```

函式內容為目前 `for` 迴圈體（第 193-366 行），改動：
- 開頭加 `if (job.status === 'cancelled') return null;`
- `pushPhase(job, 1, ...)` 放在函式開頭（PR 從排隊進入執行）
- `job.kill = () => child.kill()` 改為 `activeChildren.add(child); child.onExit(() => activeChildren.delete(child));`（注意 `child` 是 `spawnClaude` 的回傳值，型別為 `{ kill: () => void; onData: ...; onExit: ... }`）
- 不再 push 到共用 `results`/`pendingReviews`，而是 return `{ result, review }` 或 `{ result }` 物件
- 錯誤時 return `{ result: { issueKey, error: msg } }`

- [ ] **Step 2: 改寫主流程為併發池**

替換 fire-and-forget async IIFE 內的 `for` 迴圈（第 176-395 行）：

```typescript
import pLimit from 'p-limit';

// ... 在 void (async () => { 內部 ...

const limit = pLimit(5);
const activeChildren: Set<{ kill: () => void }> = new Set();
job.kill = () => activeChildren.forEach((c) => c.kill());

// 所有 PR 先推送 phase 0（排隊中）
for (const pr of toReview) {
  pushPhase(job, 0, '排隊中', `#${pr.number}`);
}

const settled = await Promise.allSettled(
  toReview.map((pr) =>
    limit(() =>
      reviewOnePr(pr, {
        job,
        ghRepo: repo.githubRepo,
        cwd: repo.cwd,
        cleanEnv,
        ansiRe: ANSI_RE,
        activeChildren,
      }),
    ),
  ),
);

// 收集結果
const results: RunResult[] = [];
const pendingReviews: Array<{...}> = [];  // 型別同原始碼

for (const r of settled) {
  if (r.status === 'fulfilled' && r.value) {
    results.push(r.value.result);
    if (r.value.review) pendingReviews.push(r.value.review);
  } else if (r.status === 'rejected') {
    console.error('[pr-review] Unexpected rejection:', r.reason);
  }
}

if (job.status !== 'cancelled') finishJob(job, results);

// ... pendingReviews 寫入 DB 邏輯不變 ...
```

- [ ] **Step 3: 更新 PHASES 常數**

在檔案頂部 `PHASES` 陣列加入 phase 0：

```typescript
const PHASES = [
  { phase: 0, label: '排隊中' },
  { phase: 1, label: '分析 PR' },
  {
    phase: 2,
    label: 'Review 中',
    pattern: /gh pr comment|gh pr review|gh api.*pulls.*comments/i,
  },
  { phase: 3, label: '完成', pattern: /REVIEW_RESULT:/i },
];
```

`detectPhaseTransition` 不需要改——它只匹配有 `pattern` 的 phase，phase 0 沒有 pattern 所以不會被匹配。

- [ ] **Step 4: 確認 lint 通過**

Run: `cd /Users/yeyuan/home/ClaudeRunner && pnpm lint`
Expected: 無錯誤

- [ ] **Step 5: Commit**

```bash
git add apps/web/server/api/pr-review/run.post.ts
git commit -m "feat: concurrent PR review with p-limit(5) pool"
```

---

### Task 3: useRunnerJob 支援 phase 0

**Files:**
- Modify: `apps/web/app/composables/useRunnerJob.ts`

- [ ] **Step 1: 修改 `buildPhaseList` 支援 phase 0**

目前 `buildPhaseList`（第 109-121 行）用 `i + 1` 計算 phase number，且第一個 phase 預設為 `running`。改為支援從 0 開始，且初始狀態根據 phase 決定：

```typescript
function buildPhaseList(dynamicPhases?: { label: string }[]): PhaseInfo[] {
  const phaseLabels = dynamicPhases ??
    options.phases ?? [
      { label: '分析 & 建立分支' },
      { label: '實作修復' },
      { label: '建立 PR' },
    ];
  return phaseLabels.map(({ label }, i) => ({
    phase: options.phases && dynamicPhases ? i : i + 1,
    label,
    status: (i === 0 ? 'running' : 'pending') as PhaseInfo['status'],
  }));
}
```

等等，這樣太脆弱了。更好的方式：讓 `startJob` 接收一個 `phaseStartIndex` 參數，或者直接讓 `dynamicPhases` 帶 phase number。

更簡潔的做法——讓 `buildPhaseList` 接受可選的起始 index：

```typescript
function buildPhaseList(
  dynamicPhases?: { label: string }[],
  startPhase = 1,
): PhaseInfo[] {
  const phaseLabels = dynamicPhases ??
    options.phases ?? [
      { label: '分析 & 建立分支' },
      { label: '實作修復' },
      { label: '建立 PR' },
    ];
  return phaseLabels.map(({ label }, i) => ({
    phase: startPhase + i,
    label,
    status: (i === 0 ? 'running' : 'pending') as PhaseInfo['status'],
  }));
}
```

- [ ] **Step 2: 修改 `applyPhase` 支援 phase 0 的 queued 語意**

目前 `applyPhase`（第 123-129 行）設定 `< phase` 為 done、`=== phase` 為 running、`> phase` 為 pending。phase 0 的語意是「排隊中」，在前端的 phase dots 應該全部是 pending。這個行為與 `phase === 0` 且第一個 phase.phase 也是 0 時的結果一致（第一個 phase 設為 running，其餘 pending），所以 `applyPhase` **不需要改動**。

但要處理一個邊界情況：當 phase event 帶 phase 0 時，目前的邏輯會把 phase 0 設為 `running`。前端需要知道這是「排隊中」而非「正在執行」。解法：在 `phase` event handler 中（第 199-220 行），如果 `phase === 0`，不更新 global phases（避免覆蓋其他已在執行的 PR 的全域狀態），只更新 per-issue phases：

```typescript
sseSource.addEventListener('phase', (e) => {
  if (!activeJob.value) return;
  const { phase, label, issueKey } = JSON.parse(e.data) as {
    issueKey: string;
    label: string;
    phase: number;
  };
  activeJob.value.currentIssueKey = issueKey;

  // Phase 0 = queued, only update per-issue, skip global
  if (phase > 0) {
    applyPhase(activeJob.value.phases, phase);
    const p = activeJob.value.phases.find((ph) => ph.phase === phase);
    if (p) p.label = label;
  }

  // Update per-issue phases
  if (!activeJob.value.phasesByIssue[issueKey]) {
    activeJob.value.phasesByIssue[issueKey] = buildPhaseList(
      undefined,
      startPhase,
    );
  }
  const issuePhases = activeJob.value.phasesByIssue[issueKey];
  if (!issuePhases) return;
  applyPhase(issuePhases, phase);
  const pi = issuePhases.find((ph) => ph.phase === phase);
  if (pi) pi.label = label;
});
```

等等，`buildPhaseList` 在 phase event handler 中被延遲呼叫，但此時沒有 `dynamicPhases` 資訊。需要在 `startJob` 時把 `dynamicPhases` 儲存起來。

改為在 composable scope 增加一個 ref：

```typescript
const _dynamicPhases = ref<{ label: string }[] | undefined>();
const _startPhase = ref(1);
```

在 `startJob` 時記錄：

```typescript
function startJob(
  jobId: string,
  issues: { key: string; summary: string }[],
  dynamicPhases?: { label: string }[],
  trigger?: 'auto' | 'manual',
  startPhase = 1,
) {
  _dynamicPhases.value = dynamicPhases;
  _startPhase.value = startPhase;
  // ... 其餘不變，但 buildPhaseList 呼叫改為：
  // buildPhaseList(dynamicPhases, startPhase)
```

然後 phase event handler 中延遲建立 phases 時用 `_dynamicPhases.value` 和 `_startPhase.value`。

- [ ] **Step 3: 確認 lint 通過**

Run: `cd /Users/yeyuan/home/ClaudeRunner && pnpm lint`
Expected: 無錯誤

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/composables/useRunnerJob.ts
git commit -m "feat: support phase 0 (queued) in useRunnerJob"
```

---

### Task 4: usePrReviewer 傳入 dynamicPhases

**Files:**
- Modify: `apps/web/app/composables/usePrReviewer.ts`

- [ ] **Step 1: 更新 `useRunnerJob` 初始化 options.phases**

將 `phases` 從 3 個改為 4 個（包含排隊中）：

```typescript
const reviewer = useRunnerJob({
  storageKey: 'pr-review-active-jobId',
  apiBase: '/api/claude-runner',
  phases: [
    { label: '排隊中' },
    { label: '分析 PR' },
    { label: 'Review 中' },
    { label: '完成' },
  ],
  onComplete: () => {
    loadHistory();
    loadPRs();
    reviewHistory.fetch();
  },
});
```

- [ ] **Step 2: 更新 `runReview` 中 `startJob` 呼叫**

在第 314 行的 `reviewer.startJob(firstJobId, allIssues)` 加入 `startPhase` 參數：

```typescript
reviewer.startJob(firstJobId, allIssues, undefined, undefined, 0);
```

這裡 `dynamicPhases` 傳 undefined 讓它使用 `options.phases`（已在 Step 1 更新）。`startPhase` 傳 0。

- [ ] **Step 3: 確認 lint 通過**

Run: `cd /Users/yeyuan/home/ClaudeRunner && pnpm lint`

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/composables/usePrReviewer.ts
git commit -m "feat: pass phase 0 config to PR review job"
```

---

### Task 5: RunnerJobProgress 前端 UI 更新

**Files:**
- Modify: `apps/web/app/components/RunnerJobProgress.vue`

- [ ] **Step 1: 加入分組排序邏輯**

在 `issueEntries` computed（第 35-54 行）後加入排序 computed：

```typescript
const sortedIssueEntries = computed(() => {
  const entries = issueEntries.value;
  // 分三組：執行中(phase 1-3 running) > 排隊中(phase 0) > 完成/失敗
  return [...entries].sort((a, b) => {
    const order = (e: typeof a) => {
      if (e.currentPhase && e.currentPhase.phase > 0) return 0; // 執行中
      if (e.currentPhase && e.currentPhase.phase === 0) return 1; // 排隊中
      if (e.allDone) return 2; // 完成
      // 尚未收到任何 phase = 排隊中
      return 1;
    };
    return order(a) - order(b);
  });
});
```

Template 中將 `v-for="entry in issueEntries"` 改為 `v-for="entry in sortedIssueEntries"`。

- [ ] **Step 2: 排隊中的 PR 狀態 icon 和樣式**

修改 status icon 區塊（第 102-117 行），在現有的三個條件之間插入「排隊中」判斷：

```html
<!-- Status icon -->
<UIcon
  v-if="entry.currentPhase && entry.currentPhase.phase > 0"
  name="i-lucide-loader-circle"
  class="text-primary-400 shrink-0 animate-spin"
/>
<UIcon
  v-else-if="entry.currentPhase && entry.currentPhase.phase === 0"
  name="i-lucide-clock"
  class="shrink-0 text-gray-500"
/>
<UIcon
  v-else-if="entry.allDone"
  name="i-lucide-circle-check"
  class="shrink-0 text-green-400"
/>
<UIcon
  v-else
  name="i-lucide-circle-dot"
  class="shrink-0 text-gray-600"
/>
```

- [ ] **Step 3: 排隊中的 phase label 顯示**

修改 phase label 區塊（第 124-130 行），加入排隊中判斷：

```html
<!-- Current phase label -->
<span v-if="entry.currentPhase && entry.currentPhase.phase > 0" class="text-sm text-blue-400">
  {{ entry.currentPhase.label }}
</span>
<span v-else-if="entry.currentPhase && entry.currentPhase.phase === 0" class="text-sm text-gray-500">
  排隊中
</span>
<span v-else-if="entry.allDone" class="text-sm text-green-400">
  完成
</span>
```

- [ ] **Step 4: 排隊中不自動展開**

修改 `expandedKeys` 的 watch（第 16-25 行），排隊中的 PR 不自動展開：

```typescript
watch(
  () => props.activeJob?.issues.map((i) => i.key),
  (keys) => {
    if (!keys || !props.activeJob) return;
    for (const k of keys) {
      // 只展開非排隊中的 issue
      const phases = props.activeJob.phasesByIssue[k];
      const isQueued = phases && phases[0]?.status === 'running' && phases[0]?.phase === 0
        && phases.slice(1).every(p => p.status === 'pending');
      if (!isQueued) {
        expandedKeys.value.add(k);
      }
    }
  },
  { immediate: true },
);
```

更好的做法：watch `phasesByIssue` 的變化，當 issue 從排隊轉為執行時才展開：

```typescript
watch(
  () => {
    if (!props.activeJob) return null;
    return Object.entries(props.activeJob.phasesByIssue).map(
      ([key, phases]) => ({ key, phase: phases.find(p => p.status === 'running')?.phase ?? -1 }),
    );
  },
  (current, prev) => {
    if (!current) return;
    for (const { key, phase } of current) {
      // 當 PR 從排隊(phase 0)進入執行(phase >= 1) 時展開
      const prevPhase = prev?.find(p => p.key === key)?.phase ?? -1;
      if (phase >= 1 && prevPhase <= 0) {
        expandedKeys.value.add(key);
      }
    }
  },
  { deep: true },
);
```

- [ ] **Step 5: Phase dots 排隊中顯示為灰色**

Phase dots 的 class 判斷（第 138-143 行）已經用 `bg-gray-700` 顯示 `pending` 狀態。排隊中時所有 dots 除了第一個（phase 0，status=running）都是 pending。

需要讓 phase 0 的 dot 也顯示為灰色而非藍色。在 phase dots 的 class 加入 phase 0 判斷：

```html
<div
  v-for="p in entry.phases.filter(p => p.phase > 0)"
  :key="p.phase"
  class="h-2 w-2 rounded-full"
  :class="{
    'bg-green-500': p.status === 'done',
    'animate-pulse bg-blue-500': p.status === 'running',
    'bg-gray-700': p.status === 'pending',
  }"
  :title="p.label"
></div>
```

注意：用 `.filter(p => p.phase > 0)` 隱藏 phase 0 的 dot，因為「排隊中」不是一個進度步驟，只是等待狀態。Phase dots 只顯示實際的 3 個執行階段。

同樣，expanded content 中的 phase progress bar（第 161-198 行）也要過濾掉 phase 0：

```html
<div
  v-for="(p, i) in entry.phases.filter(p => p.phase > 0)"
  :key="p.phase"
  ...
```

- [ ] **Step 6: 確認 lint 通過**

Run: `cd /Users/yeyuan/home/ClaudeRunner && pnpm lint`

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/components/RunnerJobProgress.vue
git commit -m "feat: UI distinguishes queued vs running PR reviews"
```

---

### Task 6: 手動驗證

- [ ] **Step 1: 啟動 dev server**

Run: `cd /Users/yeyuan/home/ClaudeRunner && pnpm dev`

- [ ] **Step 2: 開啟 PR Review 頁面，選 2-3 個 PR 開始 review**

驗證：
- 所有 PR 立即出現在 progress 面板
- 前 5 個進入執行狀態（spinner icon, 藍色 label）
- 超過 5 個的顯示排隊中（clock icon, 灰色 label, 不展開）
- 執行完一個後，排隊中的自動開始並展開
- 取消時，所有執行中的停止，排隊中的跳過

- [ ] **Step 3: 確認 typecheck 通過**

Run: `cd /Users/yeyuan/home/ClaudeRunner/apps/web && pnpm typecheck`
