// eslint-disable-next-line no-control-regex
const ANSI_RE = /\u001B\[[0-9;]*[A-Z]/gi;

export function stripAnsi(str: string): string {
  return str.replaceAll(ANSI_RE, '');
}

export interface ParsedPhase {
  label: string;
  status: 'done' | 'error';
  highlights: { type: 'file' | 'branch' | 'pr'; text: string }[];
}

const PR_URL_RE = /https:\/\/github\.com\/[^\s)]+\/pull\/\d+/g;
const BRANCH_RE = /(?:branch|分支)[:\s]+([^\s,]+)/gi;
const FILE_RE = /(?:^|\s)([\w./-]+\.\w{1,10})(?:\s|$|:)/g;

function extractHighlights(text: string): ParsedPhase['highlights'] {
  const highlights: ParsedPhase['highlights'] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(PR_URL_RE)) {
    if (!seen.has(m[0])) { seen.add(m[0]); highlights.push({ type: 'pr', text: m[0] }); }
  }
  for (const m of text.matchAll(BRANCH_RE)) {
    if (!seen.has(m[1])) { seen.add(m[1]); highlights.push({ type: 'branch', text: m[1] }); }
  }
  for (const m of text.matchAll(FILE_RE)) {
    if (m[1].includes('/') && !seen.has(m[1])) { seen.add(m[1]); highlights.push({ type: 'file', text: m[1] }); }
  }
  return highlights;
}

/**
 * Build phases from structured DB data (preferred) or fallback to output parsing.
 */
export function parsePhases(
  dbPhases: { phase: number; label: string }[] | null | undefined,
  output: string | undefined,
  hasError: boolean,
  prUrl?: string,
): ParsedPhase[] {
  // Structured phases from DB
  if (dbPhases && dbPhases.length > 0) {
    return dbPhases.map((p, i) => {
      const isLast = i === dbPhases.length - 1;
      return {
        label: p.label,
        status: (hasError && isLast) ? 'error' : 'done',
        highlights: [],
      };
    });
  }

  // Fallback: parse output text
  if (!output) {
    return [{
      label: hasError ? '執行失敗' : '執行完成',
      status: hasError ? 'error' : 'done',
      highlights: prUrl ? [{ type: 'pr', text: prUrl }] : [],
    }];
  }

  const clean = output.replaceAll(ANSI_RE, '');
  const highlights = extractHighlights(clean);
  const prHighlights = prUrl && !highlights.some((h) => h.type === 'pr')
    ? [{ type: 'pr' as const, text: prUrl }]
    : [];

  return [{
    label: hasError ? '執行失敗' : '執行完成',
    status: hasError ? 'error' : 'done',
    highlights: [...highlights, ...prHighlights],
  }];
}
