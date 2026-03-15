# ClaudeRunner v2 — 智能任务调度系统 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor ClaudeRunner from a linear pipeline into a smart dispatch system with task analysis, auto repo detection, superpowers workflow integration, JIRA lifecycle management, and PR review monitoring.

**Architecture:** Task Analyzer (独立 Claude CLI 调用) analyzes tickets and routes to appropriate execution paths. Repo mapping via JIRA labels. Dynamic phase generation replaces hardcoded phases. PR Monitor polls GitHub for new review comments. Job state machine tracks analysis → execution lifecycle.

**Tech Stack:** Nuxt 4 (Vue 3), Nitro server, Prisma (PostgreSQL), node-pty, Claude Code CLI, zod, gh CLI

**Spec:** `docs/superpowers/specs/2026-03-13-clauderunner-v2-smart-dispatch-design.md`

---

## Chunk 1: Repo 自动识别（模块五）

最小改动，最大收益。用 JIRA label 映射替代手动选 repo。

### Task 1: 创建 repo-mapping 配置

**Files:**
- Create: `apps/web/server/utils/repo-mapping.ts`

- [ ] **Step 1: 创建 repo-mapping.ts**

```typescript
// apps/web/server/utils/repo-mapping.ts

export interface RepoMapping {
  label: string;     // JIRA label, e.g. "repo:b2c-web"
  repo: string;      // repo name for display
  cwd: string;       // absolute path
}

/** JIRA label → repo path mapping. Prefix: "repo:" */
export const REPO_MAPPINGS: RepoMapping[] = [
  { label: 'repo:b2c-web', repo: 'kkday-b2c-web', cwd: `${process.env.HOME}/KKday/kkday-b2c-web` },
  { label: 'repo:member', repo: 'kkday-member-ci', cwd: `${process.env.HOME}/KKday/kkday-member-ci` },
  { label: 'repo:mobile-member', repo: 'kkday-mobile-member-ci', cwd: `${process.env.HOME}/KKday/kkday-mobile-member-ci` },
  { label: 'repo:design-system', repo: 'web-design-system', cwd: `${process.env.HOME}/KKday/web-design-system` },
];

/** Extract repo cwds from JIRA labels. Returns empty array if no repo labels found. */
export function resolveReposFromLabels(labels: string[]): RepoMapping[] {
  return REPO_MAPPINGS.filter(m => labels.includes(m.label));
}

/** Get all repo label names for use in prompts */
export function getRepoLabelList(): string {
  return REPO_MAPPINGS.map(m => `${m.label} → ${m.cwd}`).join('\n');
}

/** Get GitHub org/repo format for a mapping */
export function getGhRepo(mapping: RepoMapping): string {
  // Convention: kkday/<repo-dir-name>
  return `kkday/${mapping.repo}`;
}

/** Get all GitHub org/repo strings */
export function getAllGhRepos(): string[] {
  return REPO_MAPPINGS.map(getGhRepo);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/server/utils/repo-mapping.ts
git commit -m "feat: add repo-mapping config for JIRA label → repo resolution"
```

### Task 2: 修改 issues.get.ts 获取 labels

当前 issues.get.ts 通过 n8n webhook 获取 issues，但返回的数据中没有 labels。需要确保 labels 字段被传递。

**Files:**
- Modify: `apps/web/server/api/claude-runner/issues.get.ts`

- [ ] **Step 1: 在 issues.get.ts 中透传 labels 字段**

当前代码 (line 24-27) 只 map 了 `url`，需要确保 `labels` 也被传递。JIRA issue 原始数据通常包含 `fields.labels` 数组。

修改 `issues.get.ts`，在 return 的 map 中加入 labels：

```typescript
return issues.map((issue) => ({
  ...issue,
  url: issue.url ?? extractBrowseUrl(issue),
  labels: (issue.fields as any)?.labels?.map((l: any) => typeof l === 'string' ? l : l.name) ?? issue.labels ?? [],
}));
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/server/api/claude-runner/issues.get.ts
git commit -m "feat: pass JIRA labels through issues API for repo mapping"
```

### Task 3: 前端显示 matched repos 并移除手动 repo 选择依赖

**Files:**
- Modify: `apps/web/app/pages/index.vue`

- [ ] **Step 1: 在 JiraIssue interface 中加入 labels**

在 `index.vue` line 130-136 的 `JiraIssue` interface 中增加：

```typescript
interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  description?: string;
  url?: string;
  labels?: string[];  // NEW
}
```

- [ ] **Step 2: 添加 repo 自动解析逻辑**

在 `index.vue` script setup 中，import repo-mapping 工具并添加 computed：

```typescript
// 在 runClaude 函数中，从选中的 issues 的 labels 里解析 repos
// 如果解析到 repo labels，使用映射的 cwd
// 如果没有，fallback 到 selectedRepo
```

实际修改 `runClaude()` 函数（line 222-249）：在 POST body 中，如果 issues 的 labels 命中了 repo mapping，则使用映射的 cwd 而不是 selectedRepo。

注意：这一步 repo 解析逻辑应该放在 server 端（run.post.ts），前端只需传递 labels。

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/pages/index.vue
git commit -m "feat: add labels to JiraIssue interface for repo mapping"
```

### Task 4: 修改 run.post.ts 支持 label-based repo 解析

**Files:**
- Modify: `apps/web/server/api/claude-runner/run.post.ts`

- [ ] **Step 1: Import repo-mapping 并修改 RunRequest**

```typescript
import { resolveReposFromLabels } from '../../utils/repo-mapping';

interface RunRequest {
  issues: JiraIssue[];
  repoConfig?: { cwd: string };  // 保留作为 fallback
  mode?: 'normal' | 'smart';
  enabledSkills?: string[];
}
```

- [ ] **Step 2: 在 handler 中添加 repo 解析逻辑**

在 `defineEventHandler` 中（line 229 之后），添加逻辑：

```typescript
// 从第一个 issue 的 labels 解析 repos
const allLabels = issues.flatMap(i => (i as any).labels ?? []);
const mappedRepos = resolveReposFromLabels(allLabels);

// 如果映射到了 repos，使用映射的 cwds
// 否则 fallback 到 repoConfig.cwd
const repoCwds = mappedRepos.length > 0
  ? mappedRepos.map(r => r.cwd)
  : [repoConfig?.cwd || process.env.CLAUDE_RUNNER_CWD].filter(Boolean) as string[];

if (repoCwds.length === 0) throw new Error('No repo resolved: add repo:* labels to JIRA or select repo manually');
```

- [ ] **Step 3: 修改执行逻辑支持多 repo**

当前逻辑是对每个 issue 创建 worktree。多 repo 场景下，需要对每个 repo 分别创建 worktree。

对于 v1 先保持简单：如果 `repoCwds` 长度为 1，行为不变；如果多个，先用第一个（后续 Task Analyzer 会处理多 repo 编排）。

- [ ] **Step 4: Commit**

```bash
git add apps/web/server/api/claude-runner/run.post.ts
git commit -m "feat: resolve repo from JIRA labels in run endpoint"
```

### Task 4b: 无 Label 兜底 — 成功后自动打 label

**Files:**
- Modify: `apps/web/server/utils/claude-runner.config.ts`

- [ ] **Step 1: 在 prompt 中加入自动打 label 指令**

当 Task Analyzer 判断 repo confidence 为 high 但 ticket 没有 `repo:*` label 时，在 prompt 末尾追加指令：

```
任务完成后，请使用 mcp__claude_ai_Atlassian__editJiraIssue 为 ticket ${issue.key} 添加 label "${matchedLabel}"，
这样同类 ticket 后续可以自动映射到正确的 repo。
```

此逻辑在 `buildDynamicPrompt` 中根据 analysisResult 有条件注入。

- [ ] **Step 2: Commit**

```bash
git add apps/web/server/utils/claude-runner.config.ts
git commit -m "feat: auto-add repo label to JIRA ticket after successful high-confidence execution"
```

---

## Chunk 2: Task Analyzer（模块一）

核心调度模块。独立 Claude CLI 调用分析 ticket，输出结构化 JSON。

### Task 5: 创建 analysis types 和 zod schema

**Files:**
- Create: `apps/web/server/utils/task-analyzer.ts`

- [ ] **Step 0: 安装 zod 依赖（必须在 import 之前）**

```bash
cd apps/web && pnpm add zod
```

- [ ] **Step 1: 定义 AnalysisResult 类型和 zod schema**

```typescript
// apps/web/server/utils/task-analyzer.ts
import { z } from 'zod';

export const RepoResultSchema = z.object({
  path: z.string(),
  confidence: z.enum(['high', 'low']),
});

export const AnalysisResultSchema = z.object({
  complexity: z.enum(['simple', 'medium', 'complex']),
  repos: z.array(RepoResultSchema),
  missingInfo: z.array(z.string()),
  suggestedWorkflow: z.enum(['auto', 'superpowers-light', 'superpowers-full']),
  summary: z.string(),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
export type RepoResult = z.infer<typeof RepoResultSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/server/utils/task-analyzer.ts
git commit -m "feat: add AnalysisResult zod schema for task analyzer"
```

### Task 6: 实现 Task Analyzer 的 prompt 构建和执行

**Files:**
- Modify: `apps/web/server/utils/task-analyzer.ts`

- [ ] **Step 1: 添加 analyzer prompt builder**

```typescript
import { getRepoLabelList } from './repo-mapping';

export function buildAnalyzerPrompt(
  issue: { key: string; summary?: string; description?: string; labels?: string[] },
  previousAnswers?: { question: string; answer: string }[],
): string {
  const answersBlock = previousAnswers?.length
    ? `\n\n用户已回答的问题：\n${previousAnswers.map(a => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n')}`
    : '';

  return `你是一个 JIRA ticket 分析器。分析以下 ticket 并输出 JSON。

## Ticket 信息
- Key: ${issue.key}
- Summary: ${issue.summary ?? ''}
- Description: ${issue.description ?? ''}
- Labels: ${(issue.labels ?? []).join(', ')}
${answersBlock}

## Repo 映射表
${getRepoLabelList()}

## 分析要求
1. 判断复杂度：simple（改 1-2 个文件，逻辑简单）、medium（改多个文件，需要理解上下文）、complex（跨模块/跨 repo，需要详细规划）
2. 识别涉及的 repo：优先从 labels 中的 repo:* 标签映射，没有则根据内容推断
3. 如果 ticket 信息不足以开始实现，列出需要确认的问题（missingInfo）
4. 建议执行方式：auto（简单直接执行）、superpowers-light（需要轻量规划）、superpowers-full（需要完整规划）

## 输出格式
只输出一个 JSON 对象，不要有其他文字：
{
  "complexity": "simple | medium | complex",
  "repos": [{ "path": "~/KKday/xxx", "confidence": "high | low" }],
  "missingInfo": [],
  "suggestedWorkflow": "auto | superpowers-light | superpowers-full",
  "summary": "一句话描述"
}`.trim();
}
```

- [ ] **Step 2: 添加 analyzer 执行函数**

```typescript
import pty from 'node-pty';
import process from 'node:process';

/** Run Task Analyzer via Claude CLI. Returns parsed result or null on failure. */
export async function runTaskAnalyzer(
  issue: { key: string; summary?: string; description?: string; labels?: string[] },
  previousAnswers?: { question: string; answer: string }[],
): Promise<AnalysisResult | null> {
  const prompt = buildAnalyzerPrompt(issue, previousAnswers);

  const env: Record<string, string> = Object.fromEntries(
    Object.entries({ ...process.env, PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin' })
      .filter((e): e is [string, string] => e[1] !== undefined),
  );
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;

  return new Promise((resolve) => {
    const allText: string[] = [];
    const timeout = setTimeout(() => {
      child.kill();
      resolve(null);
    }, 60_000); // 60s timeout

    const child = pty.spawn(
      '/opt/homebrew/bin/claude',
      ['--dangerously-skip-permissions', '--output-format', 'stream-json', '-p', prompt],
      { cwd: process.cwd(), env, cols: 220, rows: 50, name: 'xterm-color' },
    );

    let lineBuffer = '';

    child.onData((data: string) => {
      const clean = data.replace(/\u001B\[[\d;?]*[a-z]|\u001B[a-z]|\u001B\][^\u0007]*(?:\u0007|\u001B\\)/gi, '')
        .replaceAll('\r\n', '\n').replaceAll('\r', '\n');
      lineBuffer += clean;
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const ev = JSON.parse(trimmed) as Record<string, unknown>;
          if (ev.type === 'assistant') {
            const content = (ev.message as any)?.content;
            const text = content?.filter((c: any) => c.type === 'text').map((c: any) => c.text ?? '').join('') ?? '';
            if (text) allText.push(text);
          }
        } catch { /* skip non-JSON */ }
      }
    });

    child.onExit(() => {
      clearTimeout(timeout);
      if (lineBuffer.trim()) allText.push(lineBuffer.trim());
      const fullText = allText.join('');
      // Extract JSON from output
      const jsonMatch = fullText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) { resolve(null); return; }
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const result = AnalysisResultSchema.parse(parsed);
        resolve(result);
      } catch {
        resolve(null);
      }
    });
  });
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/server/utils/task-analyzer.ts
git commit -m "feat: implement Task Analyzer with Claude CLI execution and zod validation"
```

### Task 7: 创建 analyze API endpoint

**Files:**
- Create: `apps/web/server/api/claude-runner/analyze.post.ts`

- [ ] **Step 1: 创建 analyze endpoint**

```typescript
// apps/web/server/api/claude-runner/analyze.post.ts
import { runTaskAnalyzer } from '../../utils/task-analyzer';
import { resolveReposFromLabels } from '../../utils/repo-mapping';

interface AnalyzeRequest {
  issue: {
    key: string;
    summary?: string;
    description?: string;
    labels?: string[];
  };
  previousAnswers?: { question: string; answer: string }[];
  mode?: 'normal' | 'smart';  // user override
}

export default defineEventHandler(async (event) => {
  const { issue, previousAnswers, mode } = await readBody<AnalyzeRequest>(event);

  // Mode override: normal → force auto, smart → force superpowers-full
  const result = await runTaskAnalyzer(issue, previousAnswers);

  if (!result) {
    // Analysis failed → fallback to manual mode
    return {
      status: 'fallback' as const,
      message: '分析失败，已降级为手动模式',
      // Try label-based repo resolution as best effort
      repos: resolveReposFromLabels(issue.labels ?? []),
    };
  }

  // Apply mode override
  if (mode === 'normal') {
    result.suggestedWorkflow = 'auto';
  } else if (mode === 'smart') {
    result.suggestedWorkflow = 'superpowers-full';
  }

  return { status: 'ok' as const, result };
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/server/api/claude-runner/analyze.post.ts
git commit -m "feat: add /api/claude-runner/analyze endpoint for task analysis"
```

### Task 8: 扩展 Job 状态机

**Files:**
- Modify: `apps/web/server/utils/jobStore.ts`
- Modify: `apps/web/prisma/schema.prisma`

- [ ] **Step 1: 修改 jobStore.ts 的 Job status 类型**

在 `jobStore.ts` line 22，扩展 status 类型：

```typescript
export interface Job {
  id: string;
  type: JobType;
  status: 'analysing' | 'awaiting_input' | 'cancelled' | 'done' | 'error' | 'executing' | 'fallback_executing' | 'planning' | 'running';
  // ... rest unchanged
  analysisResult?: unknown;  // Task Analyzer output
}
```

- [ ] **Step 2: 导出 broadcast 并添加 setJobStatus helper**

`broadcast` 当前是 module-private 函数（line 55），需要导出：

```typescript
export function broadcast(job: Job, event: JobEvent) {
  job.events.push(event);
  for (const sub of job.subscribers) sub(event);
}

export function setJobStatus(job: Job, status: Job['status']) {
  job.status = status;
  broadcast(job, { type: 'status', status } as any);
}
```

- [ ] **Step 3: 修改 Prisma schema 添加 analysisResult**

在 `schema.prisma` 的 Job model 中加入：

```prisma
model Job {
  id             String      @id
  type           String      @default("claude-runner")
  status         String
  startedAt      BigInt
  finishedAt     BigInt?
  log            String      @default("")
  analysisResult Json?       // Task Analyzer structured output
  issues         JobIssue[]
  results        JobResult[]
}
```

- [ ] **Step 4: 运行 Prisma migration**

```bash
cd apps/web && npx prisma migrate dev --name add-analysis-result
```

- [ ] **Step 5: Commit**

```bash
git add apps/web/server/utils/jobStore.ts apps/web/prisma/
git commit -m "feat: extend Job status machine and add analysisResult field"
```

### Task 9: 修改 run.post.ts 整合 Task Analyzer

**Files:**
- Modify: `apps/web/server/api/claude-runner/run.post.ts`

- [ ] **Step 1: 在 run endpoint 中集成分析步骤**

重构 `defineEventHandler`，在执行前先调用 Task Analyzer：

```typescript
// 新的执行流程：
// 1. 创建 job，状态 = 'analysing'
// 2. 对每个 issue 运行 Task Analyzer
// 3. 根据分析结果路由：
//    - missingInfo 非空 → status = 'awaiting_input'，返回 jobId + 问题列表
//    - simple + high confidence → status = 'executing'，直接执行
//    - medium/complex → status = 'planning'/'executing'，注入 superpowers prompt
// 4. 分析失败 → status = 'fallback_executing'，降级为现有线性流程
```

核心改动：将现有的 `void (async () => { ... })()` 异步执行块包装成"先分析再执行"的两阶段。

但第一版可以简化：analyze 是独立 endpoint，前端先调 analyze，根据结果决定是否调 run。run endpoint 本身只需接收 analysisResult 作为额外参数：

```typescript
interface RunRequest {
  issues: JiraIssue[];
  repoConfig?: { cwd: string };
  mode?: 'normal' | 'smart';
  enabledSkills?: string[];
  analysisResult?: AnalysisResult;  // NEW: from analyze step
  repoCwds?: string[];              // NEW: resolved repo paths
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/server/api/claude-runner/run.post.ts
git commit -m "feat: integrate Task Analyzer result into run endpoint"
```

### Task 10: 前端分析流程 UI

**Files:**
- Create: `apps/web/app/composables/useTaskAnalyzer.ts`
- Modify: `apps/web/app/pages/index.vue`

- [ ] **Step 1: 创建 useTaskAnalyzer composable**

```typescript
// apps/web/app/composables/useTaskAnalyzer.ts
export interface AnalysisResult {
  complexity: 'simple' | 'medium' | 'complex';
  repos: { path: string; confidence: 'high' | 'low' }[];
  missingInfo: string[];
  suggestedWorkflow: 'auto' | 'superpowers-light' | 'superpowers-full';
  summary: string;
}

export function useTaskAnalyzer() {
  const analysisResult = ref<AnalysisResult | null>(null);
  const analysing = ref(false);
  const analysisFailed = ref(false);
  const answers = ref<{ question: string; answer: string }[]>([]);
  const currentRound = ref(0);
  const MAX_ROUNDS = 3;

  async function analyze(
    issue: { key: string; summary?: string; description?: string; labels?: string[] },
    mode?: 'normal' | 'smart',
  ) {
    analysing.value = true;
    analysisFailed.value = false;
    try {
      const res = await $fetch<any>('/api/claude-runner/analyze', {
        method: 'POST',
        body: { issue, previousAnswers: answers.value, mode },
      });
      if (res.status === 'fallback') {
        analysisFailed.value = true;
        return null;
      }
      analysisResult.value = res.result;
      currentRound.value++;
      return res.result as AnalysisResult;
    } catch {
      analysisFailed.value = true;
      return null;
    } finally {
      analysing.value = false;
    }
  }

  function submitAnswer(question: string, answer: string) {
    answers.value.push({ question, answer });
  }

  function reset() {
    analysisResult.value = null;
    analysing.value = false;
    analysisFailed.value = false;
    answers.value = [];
    currentRound.value = 0;
  }

  const canAskMore = computed(() => currentRound.value < MAX_ROUNDS);
  const needsInput = computed(() =>
    analysisResult.value !== null && analysisResult.value.missingInfo.length > 0 && canAskMore.value
  );

  return {
    analysisResult,
    analysing,
    analysisFailed,
    answers,
    currentRound,
    needsInput,
    canAskMore,
    analyze,
    submitAnswer,
    reset,
  };
}
```

- [ ] **Step 2: 修改 index.vue 的 runClaude 流程**

将 `runClaude()` 拆分为两步：

```typescript
// Step 1: Analyze
async function analyzeThenRun() {
  const picked = issues.value.filter(i => crSelected.value.has(i.key));
  if (picked.length === 0) return;

  // Analyze first issue (representative)
  const result = await analyzer.analyze(picked[0], mode.value);

  if (!result || analyzer.analysisFailed.value) {
    // Fallback: run directly with current mode
    await runClaude();
    return;
  }

  if (analyzer.needsInput.value) {
    // Show questions UI, don't execute yet
    return;
  }

  // Auto-proceed
  await runClaudeWithAnalysis(result);
}

// Step 2: Execute with analysis result
async function runClaudeWithAnalysis(analysis: AnalysisResult) {
  // ... similar to current runClaude but passes analysisResult and resolved repos
}
```

- [ ] **Step 3: 添加分析结果展示和提问 UI**

在 index.vue template 中，当 `analyzer.analysisResult` 存在时，显示：
- 复杂度标签（simple/medium/complex 用不同颜色）
- 识别到的 repo 列表
- missingInfo 问题列表 + 回答输入框
- "继续执行" 按钮

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/composables/useTaskAnalyzer.ts apps/web/app/pages/index.vue
git commit -m "feat: add task analysis UI with Q&A flow before execution"
```

---

## Chunk 3: Superpowers 工作流整合（模块二）+ 动态 Phase

### Task 11: 重构 prompt 构建为动态模式

**Files:**
- Modify: `apps/web/server/utils/claude-runner.config.ts`

- [ ] **Step 1: 添加 complexity-based prompt builders**

保留现有 `PROMPT_NORMAL` / `PROMPT_SMART` 作为兜底，新增基于 AnalysisResult 的 prompt builder：

```typescript
import type { AnalysisResult } from './task-analyzer';

export function buildDynamicPrompt(
  issue: JiraIssue,
  skills: SkillContentMap,
  analysis: AnalysisResult,
): string {
  switch (analysis.suggestedWorkflow) {
    case 'auto':
      return buildWorkflow(issue, skills, false); // 现有 normal 流程
    case 'superpowers-light':
      return buildMediumPrompt(issue, skills, analysis);
    case 'superpowers-full':
      return buildComplexPrompt(issue, skills, analysis);
  }
}

function buildMediumPrompt(issue: JiraIssue, skills: SkillContentMap, analysis: AnalysisResult): string {
  // 轻量 brainstorm：理解需求 → 列步骤 → 执行
  // 参考 spec 中的 medium prompt 示例
}

function buildComplexPrompt(issue: JiraIssue, skills: SkillContentMap, analysis: AnalysisResult): string {
  // 完整流程：brainstorm → plan → 分步执行 + CHECKPOINT 标记
  // 参考 spec 中的 complex prompt 示例
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/server/utils/claude-runner.config.ts
git commit -m "feat: add dynamic prompt builder based on analysis complexity"
```

### Task 12: 动态 Phase 生成

**Files:**
- Modify: `apps/web/server/utils/claude-runner.config.ts`
- Modify: `apps/web/server/api/claude-runner/run.post.ts`

- [ ] **Step 0: 宽化 Phases 类型以支持动态数组**

当前 `Phases` 类型是 `typeof PHASES_NORMAL | typeof PHASES_SMART`（readonly tuple）。需要改为接受动态数组：

```typescript
// 在 claude-runner.config.ts 中
export type PhaseDefinition = { phase: number; label: string; pattern?: RegExp };
export type Phases = readonly PhaseDefinition[] | PhaseDefinition[];
```

同时修改 `detectPhaseTransition` 的参数类型为 `readonly PhaseDefinition[]`。

- [ ] **Step 1: 添加动态 phase 生成函数**

```typescript
export function generateDynamicPhases(analysis: AnalysisResult): { phase: number; label: string; pattern?: RegExp }[] {
  const phases: { phase: number; label: string; pattern?: RegExp }[] = [];
  let n = 1;

  if (analysis.suggestedWorkflow === 'superpowers-full') {
    phases.push({ phase: n++, label: '需求分析', pattern: /\[CHECKPOINT:analysis_done\]/i });
    phases.push({ phase: n++, label: '制定计划', pattern: /\[CHECKPOINT:plan_done\]/i });
  } else {
    phases.push({ phase: n++, label: '分析 & 建立分支' });
  }

  // Per-repo phases
  for (const repo of analysis.repos) {
    const repoName = repo.path.split('/').pop() ?? repo.path;
    phases.push({
      phase: n++,
      label: `${repoName} 实现`,
      pattern: new RegExp(`\\[CHECKPOINT:repo_done:${repoName}\\]`, 'i'),
    });
  }

  phases.push({ phase: n++, label: '建立 PR', pattern: /git push|PR READY|\[CHECKPOINT:pr_done/i });

  return phases;
}
```

- [ ] **Step 2: 在 run.post.ts 中使用动态 phases**

当 `analysisResult` 存在时，使用 `generateDynamicPhases` 替代 `PHASES_NORMAL` / `PHASES_SMART`。

- [ ] **Step 3: 修改 detectPhaseTransition 支持 CHECKPOINT 标记**

当前的 `detectPhaseTransition` 已支持正则匹配，只需确保 CHECKPOINT 标记能被正确检测。

- [ ] **Step 4: Commit**

```bash
git add apps/web/server/utils/claude-runner.config.ts apps/web/server/api/claude-runner/run.post.ts
git commit -m "feat: dynamic phase generation based on analysis result and CHECKPOINT markers"
```

### Task 13: 前端动态 Phase 展示

**Files:**
- Modify: `apps/web/app/composables/useRunnerJob.ts`
- Modify: `apps/web/app/pages/index.vue`

- [ ] **Step 0: 更新 ActiveJob status 类型**

在 `useRunnerJob.ts` line 16 的 `ActiveJob` interface 中，扩展 status 以匹配后端新状态：

```typescript
export interface ActiveJob {
  id: string;
  status: 'analysing' | 'awaiting_input' | 'cancelled' | 'done' | 'error' | 'executing' | 'fallback_executing' | 'planning' | 'running';
  // ... rest unchanged
}
```

同样更新 `JobApiResponse` interface（line 28）。

- [ ] **Step 1: 修改 useRunnerJob 支持动态 phases**

当前 `buildPhaseList()` 使用固定的 3 个 phase（line 86-97）。改为接受动态 phases：

```typescript
function startJob(
  jobId: string,
  issues: { key: string; summary: string }[],
  dynamicPhases?: { label: string }[],  // NEW optional param
) {
  // If dynamicPhases provided, use them instead of default
  const phaseLabels = dynamicPhases ?? options.phases ?? [
    { label: '分析 & 建立分支' },
    { label: '實作修復' },
    { label: '建立 PR' },
  ];
  // ... rest uses phaseLabels
}
```

- [ ] **Step 2: 前端传递动态 phases**

在 `index.vue` 的 `runClaudeWithAnalysis` 中，根据 analysisResult 生成 phase labels 传给 `cr.startJob`。

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/composables/useRunnerJob.ts apps/web/app/pages/index.vue
git commit -m "feat: support dynamic phase labels in job progress UI"
```

---

## Chunk 4: JIRA 生命周期管理（模块三）

### Task 14: 创建 kkday-jira-lifecycle skill

**Files:**
- Create: `apps/web/server/skills/kkday-jira-lifecycle/SKILL.md` (或放在 kkday-web-skills 仓库)

- [ ] **Step 1: 编写 SKILL.md**

```markdown
---
name: kkday-jira-lifecycle
description: 自动管理 JIRA ticket 生命周期：转状态、留评论、关联 PR
metadata:
  author: yeyuan
  version: 1.0.0
---

# JIRA Ticket 生命周期管理

在实现 JIRA ticket 的过程中，自动执行以下操作：

## 开始实现时
使用 `mcp__claude_ai_Atlassian__transitionJiraIssue` 将 ticket 状态转为 "In Progress"。
- cloudId: kkday.atlassian.net
- issueKey: 当前 ticket key
- 先用 `mcp__claude_ai_Atlassian__getTransitionsForJiraIssue` 获取可用 transition

## 分析完成时
使用 `mcp__claude_ai_Atlassian__addCommentToJiraIssue` 在 ticket 上留评论。
- 评论内容：分析结果摘要（要做什么、影响范围、注意事项）
- 格式：使用 Atlassian Document Format (ADF)

## PR 创建后
使用 `mcp__claude_ai_Atlassian__editJiraIssue` 将 PR 链接添加到 ticket。
- 在 description 末尾追加 PR 链接
- 或使用 remote issue links API

## 发现关联 ticket 时
使用 `mcp__claude_ai_Atlassian__createIssueLink` 关联相关 issue。
- linkType: "Relates" 或 "Blocks"

## 重要约束
- PR 合并后的状态变更（→ Done）不由本 skill 处理
- 每次操作前确认 ticket 存在且可访问
- 操作失败时不阻塞主流程，只记录日志
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/server/skills/kkday-jira-lifecycle/SKILL.md
git commit -m "feat: add kkday-jira-lifecycle skill for JIRA status management"
```

### Task 15: 在 prompt 中注入 lifecycle skill

**Files:**
- Modify: `apps/web/server/utils/claude-runner.config.ts`

- [ ] **Step 1: 将 kkday-jira-lifecycle 加入 WORKFLOW_SKILLS**

```typescript
const WORKFLOW_SKILLS = new Set([
  'kkday-jira-branch-checkout',
  'kkday-jira-worklog',
  'kkday-pr-convention',
  'kkday-jira-lifecycle',  // NEW
]);
```

- [ ] **Step 2: 在 buildWorkflow 中注入 lifecycle 步骤**

在 branch creation 之前加入：

```typescript
// Step: JIRA lifecycle — transition to In Progress
const lifecycle = injectSkill('kkday-jira-lifecycle', skills);
if (lifecycle) {
  steps.push(`${n}. Manage JIRA ticket lifecycle\n${lifecycle}\nTransition the ticket to "In Progress" before starting work.`);
  n++;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/server/utils/claude-runner.config.ts
git commit -m "feat: inject kkday-jira-lifecycle skill into workflow prompt"
```

---

## Chunk 5: PR Review 功能（模块四）

### Task 16: 添加 PrReviewComment Prisma model

**Files:**
- Modify: `apps/web/prisma/schema.prisma`

- [ ] **Step 1: 添加 PrReviewComment model**

```prisma
model PrReviewComment {
  id        String   @id @default(cuid())
  prUrl     String
  prNumber  Int
  repo      String
  commentId Int      @unique
  author    String
  body      String
  type      String   // "review" | "issue"
  path      String?
  line      Int?
  status    String   @default("unread")  // "unread" | "read" | "fixed" | "dismissed"
  fixCommit String?
  createdAt DateTime
  fetchedAt DateTime @default(now())
}
```

- [ ] **Step 2: 运行 migration**

```bash
cd apps/web && npx prisma migrate dev --name add-pr-review-comments
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/prisma/
git commit -m "feat: add PrReviewComment model for PR review monitoring"
```

### Task 17: 创建 PR Monitor 轮询服务

**Files:**
- Create: `apps/web/server/utils/pr-monitor.ts`

- [ ] **Step 1: 实现 PR comment 获取逻辑**

```typescript
// apps/web/server/utils/pr-monitor.ts
import { execSync } from 'node:child_process';
import prisma from './prisma';
import { getAllGhRepos } from './repo-mapping';

/** Resolve current GitHub username via gh CLI (cached) */
let _ghUser: string | null = null;
function getGhUser(): string {
  if (_ghUser) return _ghUser;
  try {
    _ghUser = execSync('gh api /user --jq .login', { encoding: 'utf8', timeout: 10_000 }).trim();
    return _ghUser;
  } catch {
    return '';
  }
}

/** Fetch new review comments for all open PRs by the current user */
export async function pollPrReviewComments(): Promise<number> {
  let newCount = 0;
  const ghUser = getGhUser();
  if (!ghUser) return 0;

  // Get open PRs across configured repos (from REPO_MAPPINGS)
  const repos = getAllGhRepos();

  for (const repo of repos) {
    try {
      // Get open PRs authored by current user
      const prsRaw = execSync(
        `gh api /repos/${repo}/pulls?state=open --jq '[.[] | select(.user.login == "${ghUser}") | {number, html_url}]'`,
        { encoding: 'utf8', timeout: 15_000 },
      );
      const prs = JSON.parse(prsRaw || '[]') as { number: number; html_url: string }[];

      for (const pr of prs) {
        // Fetch review comments (inline)
        const reviewRaw = execSync(
          `gh api /repos/${repo}/pulls/${pr.number}/comments --jq '[.[] | {id, user: .user.login, body, path, line, created_at}]'`,
          { encoding: 'utf8', timeout: 15_000 },
        );
        const reviewComments = JSON.parse(reviewRaw || '[]') as any[];

        // Fetch issue comments (general)
        const issueRaw = execSync(
          `gh api /repos/${repo}/issues/${pr.number}/comments --jq '[.[] | {id, user: .user.login, body, created_at}]'`,
          { encoding: 'utf8', timeout: 15_000 },
        );
        const issueComments = JSON.parse(issueRaw || '[]') as any[];

        // Upsert into database
        for (const c of reviewComments) {
          const exists = await prisma.prReviewComment.findUnique({ where: { commentId: c.id } });
          if (!exists) {
            await prisma.prReviewComment.create({
              data: {
                prUrl: pr.html_url,
                prNumber: pr.number,
                repo,
                commentId: c.id,
                author: c.user,
                body: c.body,
                type: 'review',
                path: c.path,
                line: c.line,
                createdAt: new Date(c.created_at),
              },
            });
            newCount++;
          }
        }

        for (const c of issueComments) {
          const exists = await prisma.prReviewComment.findUnique({ where: { commentId: c.id } });
          if (!exists) {
            await prisma.prReviewComment.create({
              data: {
                prUrl: pr.html_url,
                prNumber: pr.number,
                repo,
                commentId: c.id,
                author: c.user,
                body: c.body,
                type: 'issue',
                createdAt: new Date(c.created_at),
              },
            });
            newCount++;
          }
        }
      }
    } catch (error) {
      console.error(`[pr-monitor] Failed to poll ${repo}:`, error);
    }
  }

  return newCount;
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/server/utils/pr-monitor.ts
git commit -m "feat: add PR Monitor polling service for review comments"
```

### Task 18: 注册定时轮询任务

**Files:**
- Create: `apps/web/server/plugins/pr-monitor.ts`

- [ ] **Step 1: 创建 Nitro 插件注册定时任务**

注意：`apps/web/server/plugins/` 目录不存在，需要先创建。Nitro 会自动扫描此目录中的插件。

```typescript
// apps/web/server/plugins/pr-monitor.ts
import { pollPrReviewComments } from '../utils/pr-monitor';

const POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

export default defineNitroPlugin((nitro) => {
  // Start polling immediately (Nitro plugins run once at startup)
  const timer = setInterval(async () => {
    try {
      const newCount = await pollPrReviewComments();
      if (newCount > 0) {
        console.log(`[pr-monitor] Found ${newCount} new review comments`);
      }
    } catch (error) {
      console.error('[pr-monitor] Poll failed:', error);
    }
  }, POLL_INTERVAL);

  // Run once immediately on startup
  pollPrReviewComments().catch(console.error);

  // Cleanup on close
  nitro.hooks.hook('close', () => {
    clearInterval(timer);
  });
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/server/plugins/pr-monitor.ts
git commit -m "feat: register PR Monitor as Nitro plugin with 5-min polling"
```

### Task 19: 创建 notifications API endpoint

**Files:**
- Create: `apps/web/server/api/pr-runner/notifications.get.ts`

- [ ] **Step 1: 创建 notifications endpoint**

```typescript
// apps/web/server/api/pr-runner/notifications.get.ts
import prisma from '../../utils/prisma';

export default defineEventHandler(async () => {
  const unreadCount = await prisma.prReviewComment.count({
    where: { status: 'unread' },
  });

  const unreadByPr = await prisma.prReviewComment.groupBy({
    by: ['prUrl', 'prNumber', 'repo'],
    where: { status: 'unread' },
    _count: true,
  });

  return {
    total: unreadCount,
    byPr: unreadByPr.map(g => ({
      prUrl: g.prUrl,
      prNumber: g.prNumber,
      repo: g.repo,
      count: g._count,
    })),
  };
});
```

- [ ] **Step 2: 创建 comments list endpoint**

```typescript
// apps/web/server/api/pr-runner/comments.get.ts
import prisma from '../../utils/prisma';

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const prNumber = query.prNumber ? Number(query.prNumber) : undefined;
  const repo = query.repo as string | undefined;
  const status = query.status as string | undefined;

  const where: any = {};
  if (prNumber) where.prNumber = prNumber;
  if (repo) where.repo = repo;
  if (status) where.status = status;

  return prisma.prReviewComment.findMany({
    where,
    orderBy: { createdAt: 'desc' },
  });
});
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/server/api/pr-runner/notifications.get.ts apps/web/server/api/pr-runner/comments.get.ts
git commit -m "feat: add PR review notifications and comments API endpoints"
```

### Task 20: 增强 PR Runner 支持评估 + 修复 + 回复

**Files:**
- Modify: `apps/web/server/api/pr-runner/run.post.ts`

- [ ] **Step 1: 修改 buildPrompt 增加评估和回复逻辑**

替换现有的 `buildPrompt` 函数（line 42-57）为增强版本：

```typescript
function buildPrompt(pr: PRItem, reviewComments: string): string {
  return `你要处理以下 PR 的 review comments。请按照以下流程：

## 1. 评估每条 comment
对每条 review comment 评估：
- validity: valid（有道理）/ false_positive（误报）
- severity: critical / should-fix / minor / ignore
- effort: 预估修复工作量

## 2. 修复 valid 的 comments
- 简单问题（typo、命名、格式）直接修复
- 涉及架构/逻辑的问题也尝试修复，但要谨慎
- 每个 fix 单独一个 commit，commit message 格式：fix: [简短说明]

## 3. 回复 reviewer
修复完所有 comment 后，对每条 comment 使用 gh api 回复：
- 修复的：回复 "Fixed in commit \`<SHA>\` — [做了什么]"
- 不需要改的：回复 "Thanks for the review. This is intentional because [原因]"

回复方式：
\`\`\`bash
gh api /repos/${pr.repo}/pulls/${pr.number}/comments/<comment_id>/replies -f body="<reply>"
\`\`\`

## 4. Push
git push origin ${pr.branch}

## PR 信息
Repo: ${pr.repo}
PR #${pr.number}: ${pr.title}
Branch: ${pr.branch}

## Review comments
${reviewComments}

完成后打印 "PR_FIXED: #${pr.number}"`.trim();
}
```

- [ ] **Step 2: 修改 fetchReviewComments 同时抓取 issue comments**

```typescript
async function fetchReviewComments(pr: PRItem): Promise<string> {
  const { execSync } = await import('node:child_process');
  const parts: string[] = [];

  // Review comments (inline)
  try {
    const raw = execSync(
      String.raw`gh api /repos/${pr.repo}/pulls/${pr.number}/comments --jq '.[] | "review_comment_id:\(.id) | \(.user.login) on \(.path):\(.line // "?"): \(.body)"'`,
      { encoding: 'utf8', timeout: 15_000 },
    );
    if (raw.trim()) parts.push('--- Inline Review Comments ---\n' + raw.trim());
  } catch { /* skip */ }

  // Issue comments (general)
  try {
    const raw = execSync(
      String.raw`gh api /repos/${pr.repo}/issues/${pr.number}/comments --jq '.[] | "issue_comment_id:\(.id) | \(.user.login): \(.body)"'`,
      { encoding: 'utf8', timeout: 15_000 },
    );
    if (raw.trim()) parts.push('--- General Comments ---\n' + raw.trim());
  } catch { /* skip */ }

  return parts.join('\n\n') || '（無 review 留言）';
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/server/api/pr-runner/run.post.ts
git commit -m "feat: enhance PR runner with comment evaluation, fixes, and reviewer replies"
```

### Task 21: 前端 PR review 通知 UI

**Files:**
- Create: `apps/web/app/composables/usePrNotifications.ts`
- Modify: `apps/web/app/pages/index.vue`

- [ ] **Step 1: 创建 usePrNotifications composable**

```typescript
// apps/web/app/composables/usePrNotifications.ts
export interface PrNotification {
  prUrl: string;
  prNumber: number;
  repo: string;
  count: number;
}

export function usePrNotifications() {
  const total = ref(0);
  const byPr = ref<PrNotification[]>([]);
  let timer: ReturnType<typeof setInterval> | null = null;

  async function fetch() {
    try {
      const data = await $fetch<{ total: number; byPr: PrNotification[] }>(
        '/api/pr-runner/notifications',
      );
      total.value = data.total;
      byPr.value = data.byPr;
    } catch { /* silent */ }
  }

  function startPolling(interval = 30_000) {
    fetch();
    timer = setInterval(fetch, interval);
  }

  function stopPolling() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { total, byPr, fetch, startPolling, stopPolling };
}
```

- [ ] **Step 2: 在 index.vue 中添加通知徽章**

在 PR Runner tab 标签旁显示未读数量：

```html
<!-- PR tab with notification badge -->
<button @click="activeFeature = 'pr'" :class="...">
  PR Review
  <span v-if="prNotifications.total.value > 0"
    class="ml-1 inline-flex items-center rounded-full bg-red-500 px-2 py-0.5 text-xs text-white">
    {{ prNotifications.total.value }}
  </span>
</button>
```

- [ ] **Step 3: 在 onMounted 中启动轮询**

```typescript
const prNotifications = usePrNotifications();
onMounted(() => {
  prNotifications.startPolling();
});
onUnmounted(() => {
  prNotifications.stopPolling();
});
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/composables/usePrNotifications.ts apps/web/app/pages/index.vue
git commit -m "feat: add PR review notification badge with 30s polling"
```

---

## Implementation Notes

### 关于多 Repo 执行

Chunk 1 (Task 4) 先做简单的单 repo 支持。真正的多 repo 编排（顺序执行、依赖感知）在 Chunk 2 的 Task Analyzer 和 Chunk 3 的动态 Phase 中逐步实现。

### 关于测试

当前项目没有测试基础设施。建议对核心逻辑（repo-mapping 解析、zod schema 校验、dynamic phase 生成）添加单元测试，但不阻塞主功能开发。

### 关于向后兼容

所有改动保持向后兼容：
- 现有 `repoConfig.cwd` 手动选择仍然可用作 fallback
- 现有 `mode` 选择仍然生效
- 没有 analysisResult 时走现有线性流程
- Phase 展示在没有动态 phases 时使用默认 3 phase
