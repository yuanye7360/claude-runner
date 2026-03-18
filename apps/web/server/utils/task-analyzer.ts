// apps/web/server/utils/task-analyzer.ts
import process from 'node:process';

import pty from 'node-pty';
import { z } from 'zod';

import { getRepoLabelList } from './repo-mapping';

// ─── Zod Schemas ────────────────────────────────────────────────────────────

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

// ─── Prompt Builder ─────────────────────────────────────────────────────────

export async function buildAnalyzerPrompt(
  issue: {
    description?: string;
    key: string;
    labels?: string[];
    summary?: string;
  },
  previousAnswers?: { answer: string; question: string }[],
): Promise<string> {
  const answersBlock = previousAnswers?.length
    ? `\n\n用户已回答的问题：\n${previousAnswers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n')}`
    : '';

  const repoLabelList = await getRepoLabelList();

  return `你是一个 JIRA ticket 分析器。分析以下 ticket 并输出 JSON。

## Ticket 信息
- Key: ${issue.key}
- Summary: ${issue.summary ?? ''}
- Description: ${issue.description ?? ''}
- Labels: ${(issue.labels ?? []).join(', ')}
${answersBlock}

## Repo 映射表
${repoLabelList}

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

// ─── ANSI cleanup ───────────────────────────────────────────────────────────

/* eslint-disable no-control-regex -- intentional: matching ESC/BEL control chars */
const ANSI_RE =
  /\u001B\[[\d;?]*[a-z]|\u001B[a-z]|\u001B\][^\u0007]*(?:\u0007|\u001B\\)/gi;
/* eslint-enable no-control-regex */

// ─── Execution ──────────────────────────────────────────────────────────────

/** Run Task Analyzer via Claude CLI. Returns parsed result or null on failure. */
export async function runTaskAnalyzer(
  issue: {
    description?: string;
    key: string;
    labels?: string[];
    summary?: string;
  },
  previousAnswers?: { answer: string; question: string }[],
): Promise<AnalysisResult | null> {
  const prompt = await buildAnalyzerPrompt(issue, previousAnswers);

  const env: Record<string, string> = Object.fromEntries(
    Object.entries({
      ...process.env,
      PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
    }).filter((e): e is [string, string] => e[1] !== undefined),
  );
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;

  return new Promise((resolve) => {
    const allText: string[] = [];
    let child: ReturnType<typeof pty.spawn>;

    const timeout = setTimeout(() => {
      try {
        child.kill();
      } catch {
        /* already dead */
      }
      resolve(null);
    }, 60_000);

    try {
      child = pty.spawn(
        '/opt/homebrew/bin/claude',
        [
          '--dangerously-skip-permissions',
          '--output-format',
          'stream-json',
          '-p',
          prompt,
        ],
        {
          cwd: process.cwd(),
          env,
          cols: 220,
          rows: 50,
          name: 'xterm-color',
        },
      );
    } catch {
      clearTimeout(timeout);
      resolve(null);
      return;
    }

    let lineBuffer = '';

    child.onData((data: string) => {
      const clean = data
        .replaceAll(ANSI_RE, '')
        .replaceAll('\r\n', '\n')
        .replaceAll('\r', '\n');
      lineBuffer += clean;
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const ev = JSON.parse(trimmed) as Record<string, unknown>;
          if (ev.type === 'assistant') {
            const content = (
              ev.message as {
                content: Array<{ text?: string; type: string }>;
              }
            )?.content;
            const text =
              content
                ?.filter((c) => c.type === 'text')
                .map((c) => c.text ?? '')
                .join('') ?? '';
            if (text) allText.push(text);
          }
        } catch {
          /* skip non-JSON lines */
        }
      }
    });

    child.onExit(() => {
      clearTimeout(timeout);
      if (lineBuffer.trim()) allText.push(lineBuffer.trim());
      const fullText = allText.join('');

      // Extract JSON from output
      const jsonMatch = /\{[\s\S]*\}/.exec(fullText);
      if (!jsonMatch) {
        resolve(null);
        return;
      }

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
