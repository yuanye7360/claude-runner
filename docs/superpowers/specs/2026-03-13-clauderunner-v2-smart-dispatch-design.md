# ClaudeRunner v2 — 智能任务调度系统设计

## 概述

将 ClaudeRunner 从线性流水线改造为智能调度系统。核心变化：任务分析驱动执行路径，支持交互式提问，自动识别 repo，整合 superpowers 工作流，增强 JIRA 修改能力，新增 PR review 处理与监控。

## 模块一：Task Analyzer（任务分析器）

### 职责

所有任务的统一入口。接收 JIRA ticket，输出结构化分析结果，自动路由到合适的执行路径。

### 分析输出

```json
{
  "complexity": "simple | medium | complex",
  "repos": [
    { "path": "~/KKday/kkday-b2c-web", "confidence": "high | low" }
  ],
  "missingInfo": ["需要确认的问题..."],
  "suggestedWorkflow": "auto | superpowers-light | superpowers-full",
  "summary": "一句话描述要做什么"
}
```

### 信息获取

通过 Atlassian MCP 获取完整 ticket 信息：
- summary、description
- comments（可能有补充说明）
- linked issues（关联上下文）
- labels（用于 repo 映射）

### 路由决策

| 条件 | 路径 |
|------|------|
| `missingInfo` 非空 | 暂停，UI 展示问题列表，等用户回答后重新分析 |
| `simple` + 所有 repo `high confidence` | 全自动执行（建分支 → 实现 → PR → worklog） |
| `medium` | superpowers-light：快速 brainstorm → 生成计划 → 执行 |
| `complex` | superpowers-full：完整 brainstorm → writing-plans → 分步执行，有 checkpoint |

关键点：`missingInfo` 为空时不停下来等用户，直接往下走。只有真正信息不足时才打断。

### 实现机制

Task Analyzer 本质是一次独立的 Claude Code CLI 调用，专用 prompt 要求输出结构化 JSON：

1. **调用方式：** `pty.spawn('claude', ['-p', analyzerPrompt])` — 和现在的 run 一样用 CLI，但 prompt 不同
2. **Prompt 结构：** 注入 ticket 全部信息 + repo 映射表 + 分析指令，要求输出 JSON
3. **JSON 提取：** 从 Claude 输出中用正则提取 `{...}` JSON 块，用 zod schema 校验
4. **失败兜底：** 分析失败时（超时、JSON 解析失败、MCP 工具异常），自动降级为当前的线性流程（用户手选 repo，直接执行），UI 显示"分析失败，已降级为手动模式"

### 交互式提问

当 `missingInfo` 非空时：
- UI 展示问题列表，用户逐条回答
- 用户回答后，系统发起新一轮分析调用，原始 ticket 信息 + 用户回答一起注入 prompt
- 最多 3 轮提问，超过后强制进入执行阶段（用已有信息尽力执行）

### 模式映射

现有 `normal` / `smart` 模式保留作为用户偏好覆盖：
- 用户未选模式 → Task Analyzer 自动决定 workflow
- 用户手动选 `normal` → 强制走 `auto`（全自动）
- 用户手动选 `smart` → 强制走 `superpowers-full`（完整流程）

## 模块二：Superpowers 工作流整合

### 执行策略

不是调用 skill tool，而是把 superpowers 的思维框架注入 prompt。

| 复杂度 | Prompt 策略 |
|--------|------------|
| simple | 直接执行指令，无规划阶段 |
| medium | 注入轻量 brainstorm 框架：理解需求 → 列出实现步骤 → 执行 |
| complex | 注入完整框架：brainstorm（分析需求、边界情况）→ writing-plans（详细计划、依赖顺序）→ 按计划分步执行 |

### 动态 Phase 生成

Phase 不再硬编码，由 Task Analyzer 的分析结果动态生成。

示例 — complex 任务涉及 3 个 repo：
1. 分析与规划
2. kkday-b2c-web 实现
3. web-design-system 实现
4. kkday-member-ci 实现
5. 建 PR × 3
6. Worklog

### Prompt 示例

**medium（轻量规划）：**
```
你正在实现以下 JIRA ticket：[ticket 信息]
涉及 repo：[repo 列表]

请先用 2-3 句话分析这个需求的核心目标和注意事项，
然后列出实现步骤（不超过 5 步），
最后按步骤执行。

[注入的 skills 内容]
```

**complex（完整流程）：**
```
你正在实现以下 JIRA ticket：[ticket 信息]
涉及 repo：[repo 列表]
这是一个复杂任务，请严格按以下流程执行：

## 阶段一：需求分析
深入分析需求，考虑边界情况、影响范围、风险点。输出分析报告。
完成后输出标记：[CHECKPOINT:analysis_done]

## 阶段二：实现计划
制定详细实现计划，包含每个 repo 的改动内容、依赖顺序、测试策略。
完成后输出标记：[CHECKPOINT:plan_done]

## 阶段三：逐 Repo 执行
按计划逐个 repo 执行，每个完成后输出标记：[CHECKPOINT:repo_done:<repo_name>]

## 阶段四：收尾
创建 PR、记录 worklog。

[注入的 skills 内容]
```

### 多 Repo 执行策略

- **顺序执行：** 默认按 Task Analyzer 规划的顺序逐个执行，不并行（避免跨 repo 依赖问题）
- **依赖感知：** 如 design-system 的变更需要先发布才能被 b2c-web 消费，计划阶段要识别并安排正确顺序
- **每个 repo 独立 worktree：** 各 repo 的 cwd 不同，每个 repo 独立创建 worktree 和分支

### Checkpoint 机制

complex 任务在以下节点输出 `[CHECKPOINT:*]` 标记，后端正则匹配后推送到前端：
- `[CHECKPOINT:analysis_done]` — 分析完成
- `[CHECKPOINT:plan_done]` — 计划完成
- `[CHECKPOINT:repo_done:<name>]` — 某个 repo 实现完成
- `[CHECKPOINT:pr_done:<name>]` — PR 创建完成

Checkpoint 为信息展示用，不阻塞执行。用户可在 UI 上实时看到进度，但不需要手动确认。

## 模块三：JIRA 生命周期管理

### 新增 Skill：kkday-jira-lifecycle

定义 JIRA ticket 在工作流中的自动变更规则。

| 时机 | 动作 | MCP 工具 |
|------|------|---------|
| 开始实现 | ticket 状态 → "In Progress" | `transitionJiraIssue` |
| 分析完成 | 在 ticket 留评论，记录分析结果 | `addCommentToJiraIssue` |
| PR 创建后 | 把 PR 链接加到 ticket | `editJiraIssue` |
| 发现关联 ticket | 自动关联 | `createIssueLink` |

注意：PR 合并后的状态变更（→ Done）不由系统处理，由人工管控。

### 留痕

所有 JIRA 修改操作都记录在 UI 的 job log 中，可追溯。

## 模块四：PR Review 功能

### 4a. Review Comment 处理

整合并增强现有 PR Runner 和 copilot-review skill，统一处理所有 reviewer 的 comments。

**Comment 范围：**
- PR review comments（代码行上的评论，`/pulls/{id}/comments`）
- Issue comments（PR 页面的通用讨论评论，`/issues/{id}/comments`）
- 两者都抓取，因为架构层面的反馈通常出现在 issue comments 里

**流程：**
1. 抓取 PR 的所有 review comments + issue comments
2. 分类评估每条 comment：
   - validity：valid / false positive
   - severity：critical / should-fix / minor / ignore
   - effort：预估修复工作量
3. 智能判断：
   - 简单 comment（typo、命名、格式）→ 直接修复
   - 涉及架构/逻辑 → 展示分析让用户确认
4. 修复：每个 fix 单独 commit
5. 回复 reviewer：
   - 修复的：`Fixed in commit \`abc123\` — [简短说明]`
   - 判定为不需要改的：`Thanks for the review. This is intentional because [原因]`

### 4b. PR Monitor（自动监控）

**机制：**
- 使用 Nuxt 的 `defineCronHandler` 或 `nitro:init` hook 注册定时任务，每 5 分钟轮询一次
- 通过 `gh api /user/repos` + `gh api /repos/{owner}/{repo}/pulls` 检查 open PRs
- 用 `since` 参数增量获取新 comments，避免重复
- 新 comment 存入 `PrReviewComment` 表：

```prisma
model PrReviewComment {
  id          String   @id @default(cuid())
  prUrl       String
  prNumber    Int
  repo        String
  commentId   Int      @unique  // GitHub comment ID，用于去重
  author      String
  body        String
  type        String   // "review" | "issue"
  path        String?  // 代码文件路径（review comment 才有）
  line        Int?     // 代码行号（review comment 才有）
  status      String   @default("unread")  // "unread" | "read" | "fixed" | "dismissed"
  fixCommit   String?  // 修复的 commit SHA
  createdAt   DateTime
  fetchedAt   DateTime @default(now())
}
```

- 服务重启后定时任务自动恢复（Nitro 生命周期管理）
- 前端每 30 秒轮询 `/api/pr-runner/notifications` 获取未读数量

**交互：**
- 点击通知徽章 → 展示 review comments 列表（按 PR 分组）
- 一键处理 → 进入 4a 流程

## 模块五：Repo 自动识别

### JIRA Label 映射

使用 `repo:` 前缀的 JIRA label 做映射：

| Label | Repo 路径 |
|-------|----------|
| `repo:b2c-web` | ~/KKday/kkday-b2c-web |
| `repo:member` | ~/KKday/kkday-member-ci |
| `repo:mobile-member` | ~/KKday/kkday-mobile-member-ci |
| `repo:design-system` | ~/KKday/web-design-system |

### 识别策略（优先级从高到低）

1. **JIRA label** — ticket 有 `repo:*` label，直接映射
2. **Claude 智能判断** — 无 label 时，根据 ticket 内容推断 repo + confidence
3. **用户确认** — confidence 低时，UI 让用户选择

### 多 Repo 场景

一个 ticket 打多个 `repo:*` label，系统识别为多 repo 任务，Task Analyzer 自动规划每个 repo 的执行顺序。

### 无 Label 兜底

当 Claude 智能判断成功完成任务后，且判断 confidence 为 high 时，在 JIRA ticket 上自动添加对应的 `repo:*` label（而非留评论建议），减少噪音。confidence 为 low 时不做任何自动操作，仅在 job log 中记录。

## 实现优先级

建议按以下顺序逐步实现：

1. **模块五 Repo 识别** — 改动最小，立即改善手动选 repo 的痛点
2. **模块一 Task Analyzer** — 核心调度能力，解决描述不准确和交互提问的问题
3. **模块三 JIRA 生命周期** — 新增 skill，独立于主流程
4. **模块二 Superpowers 整合** — 依赖 Task Analyzer，改造 prompt 构建逻辑
5. **模块四 PR Review** — 独立功能，可以和其他模块并行开发

## 技术要点

### Prompt 构建改造

现有 `claude-runner.config.ts` 的 `PROMPT_NORMAL` / `PROMPT_SMART` 替换为动态 prompt 构建：
- 输入：Task Analyzer 的分析结果 + 启用的 skills
- 输出：根据复杂度和场景组装的 prompt
- Skills 注入方式不变，但注入位置和组合更灵活

### 数据库变更

新增表/字段：
- `PrReviewComment`：存储抓取的 review comments（schema 见模块四）
- Repo 映射表使用代码中的常量配置（`repo-mapping.ts`），不入数据库，因为映射关系稳定且数量少
- `Job` 表新增字段：`analysisResult Json?`（JSON 列，存 Task Analyzer 的结构化输出）

### Job 状态机

现有 `status` 字段扩展为状态机：

```
analyzing → awaiting_input → planning → executing → done
                                                  ↘ error
              ↗ (missingInfo 非空时)    ↗ (medium/complex)
analyzing → executing (simple 直接跳到执行)
analyzing → fallback_executing (分析失败，降级为手动模式)
```

前端根据状态展示不同 UI：
- `analyzing`：显示分析中动画
- `awaiting_input`：显示问题列表和回答输入框
- `planning`：显示规划进度
- `executing`：显示动态 phases 和 checkpoints
- `done` / `error`：显示结果

### 前端变更

- 移除手动 repo 选择（改为分析后自动识别/确认）
- 新增分析结果展示区域（复杂度、repo 列表、问题清单）
- 新增 PR review 通知徽章
- Phase 展示从固定改为动态
- 新增交互式提问/回答 UI（当 missingInfo 非空时）
