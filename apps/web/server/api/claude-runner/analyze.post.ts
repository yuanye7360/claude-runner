import { resolveReposFromLabels } from '../../utils/repo-mapping';
// apps/web/server/api/claude-runner/analyze.post.ts
import { runTaskAnalyzer } from '../../utils/task-analyzer';

interface AnalyzeRequest {
  issue: {
    description?: string;
    key: string;
    labels?: string[];
    summary?: string;
  };
  previousAnswers?: { answer: string; question: string }[];
  mode?: 'normal' | 'smart';
}

export default defineEventHandler(async (event) => {
  const { issue, previousAnswers, mode } =
    await readBody<AnalyzeRequest>(event);

  const result = await runTaskAnalyzer(issue, previousAnswers);

  if (!result) {
    return {
      status: 'fallback' as const,
      message: '分析失败，已降级为手动模式',
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
