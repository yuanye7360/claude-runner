export interface ParsedPhase {
  label: string;
  status: 'done' | 'error';
  lines: string[];
  highlights: { text: string; type: 'branch' | 'file' | 'pr' }[];
}

// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001B\[[0-9;]*[A-Z]/gi;

export function stripAnsi(str: string): string {
  return str.replaceAll(ANSI_RE, '');
}

const FILE_RE = /(?:^|\s)([\w./-]+\.\w{1,10})(?:\s|$|:)/g;
const BRANCH_RE = /(?:branch|分支)[:\s]+([^\s,]+)/gi;
const PR_URL_RE = /https:\/\/github\.com\/[^\s)]+\/pull\/\d+/g;

function extractHighlights(text: string): ParsedPhase['highlights'] {
  const highlights: ParsedPhase['highlights'] = [];
  const seen = new Set<string>();

  for (const m of text.matchAll(PR_URL_RE)) {
    if (!seen.has(m[0])) {
      seen.add(m[0]);
      highlights.push({ type: 'pr', text: m[0] });
    }
  }
  for (const m of text.matchAll(BRANCH_RE)) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      highlights.push({ type: 'branch', text: m[1] });
    }
  }
  for (const m of text.matchAll(FILE_RE)) {
    const f = m[1];
    if (f.includes('/') && !seen.has(f)) {
      seen.add(f);
      highlights.push({ type: 'file', text: f });
    }
  }
  return highlights;
}

export function parseOutput(
  raw: string | undefined,
  hasError: boolean,
  prUrl?: string,
): ParsedPhase[] {
  if (!raw) {
    return [
      {
        label: hasError ? '執行失敗' : '執行完成',
        status: hasError ? 'error' : 'done',
        lines: [hasError ? '無詳細輸出' : '任務已完成'],
        highlights: prUrl ? [{ type: 'pr', text: prUrl }] : [],
      },
    ];
  }

  const clean = raw.replaceAll(ANSI_RE, '');
  const allLines = clean.split('\n').filter((l) => l.trim());

  // Simple heuristic: split into 3 phases based on content
  const analysisLines: string[] = [];
  const implLines: string[] = [];
  const prLines: string[] = [];

  let currentPhase = 'analysis';
  for (const line of allLines) {
    const lower = line.toLowerCase();
    if (
      currentPhase === 'analysis' &&
      (lower.includes('implement') ||
        lower.includes('修改') ||
        lower.includes('修復') ||
        lower.includes('fixing') ||
        lower.includes('writing') ||
        lower.includes('creating file'))
    ) {
      currentPhase = 'impl';
    }
    if (
      currentPhase !== 'pr' &&
      (lower.includes('pull request') ||
        lower.includes('creating pr') ||
        lower.includes('建立 pr') ||
        lower.includes('gh pr create') ||
        PR_URL_RE.test(line))
    ) {
      currentPhase = 'pr';
      PR_URL_RE.lastIndex = 0;
    }

    if (currentPhase === 'analysis') analysisLines.push(line);
    else if (currentPhase === 'impl') implLines.push(line);
    else prLines.push(line);
  }

  const phases: ParsedPhase[] = [];

  if (analysisLines.length > 0) {
    const text = analysisLines.join('\n');
    phases.push({
      label: '分析 & 建立分支',
      status: 'done',
      lines: analysisLines.slice(0, 8),
      highlights: extractHighlights(text),
    });
  }

  if (implLines.length > 0) {
    const text = implLines.join('\n');
    phases.push({
      label: '實作修復',
      status: hasError && prLines.length === 0 ? 'error' : 'done',
      lines: implLines.slice(0, 8),
      highlights: extractHighlights(text),
    });
  }

  if (prLines.length > 0 || prUrl) {
    const text = prLines.join('\n');
    const highlights = extractHighlights(text);
    if (prUrl && !highlights.some((h) => h.type === 'pr')) {
      highlights.push({ type: 'pr', text: prUrl });
    }
    phases.push({
      label: '建立 PR',
      status: 'done',
      lines: prLines.slice(0, 5),
      highlights,
    });
  }

  // If nothing was parsed, return a single phase with all lines
  if (phases.length === 0) {
    phases.push({
      label: hasError ? '執行失敗' : '執行完成',
      status: hasError ? 'error' : 'done',
      lines: allLines.slice(0, 10),
      highlights: prUrl ? [{ type: 'pr', text: prUrl }] : [],
    });
  }

  return phases;
}
