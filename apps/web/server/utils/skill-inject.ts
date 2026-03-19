/** Fallback: infer inject target from skill name for external skills without inject field */
const NAME_INJECT_FALLBACK: Record<string, string> = {
  'kkday-jira-branch-checkout': 'branch',
  'kkday-jira-lifecycle': 'jira',
  'kkday-jira-worklog': 'worklog',
  'kkday-pr-convention': 'pr',
};

export function resolveInjectTarget(
  name: string,
  frontmatterInject?: string,
): string {
  return frontmatterInject || NAME_INJECT_FALLBACK[name] || 'context';
}
