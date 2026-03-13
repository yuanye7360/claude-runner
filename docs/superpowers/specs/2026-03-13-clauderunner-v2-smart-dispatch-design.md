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

### Checkpoint 机制

complex 任务在以下节点输出标记供 UI 展示：
- 计划完成
- 每个 repo 实现完成
- PR 创建完成

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

**流程：**
1. 抓取 PR 的所有 review comments
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
- 定时任务轮询（cron / setInterval），通过 `gh api` 检查用户的 open PRs
- 检测新 review comments，存入数据库，标记已读/未读
- 前端通知：UI 显示未处理 review 数量（类似未读消息徽章）

**交互：**
- 点击通知 → 展示 review comments 列表
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

当 Claude 智能判断成功完成任务后，在 JIRA ticket 上留评论建议添加对应的 repo label，方便后续同类 ticket 直接命中。

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
- `PrReviewComment`：存储抓取的 review comments，含 read/unread 状态
- `RepoMapping`：持久化 label → repo 映射（也可以用 JSON 文件）
- `Job` 表新增字段：`analysisResult`（存 Task Analyzer 的输出）

### 前端变更

- 移除手动 repo 选择（改为分析后自动识别/确认）
- 新增分析结果展示区域（复杂度、repo 列表、问题清单）
- 新增 PR review 通知徽章
- Phase 展示从固定改为动态
- 新增交互式提问/回答 UI（当 missingInfo 非空时）
