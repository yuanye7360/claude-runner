---
name: kkday-jira-lifecycle
description: 自动管理 JIRA ticket 生命周期：转状态、留评论、关联 PR
inject: jira
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
