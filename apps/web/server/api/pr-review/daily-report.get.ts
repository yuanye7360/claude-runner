import prisma from '../../utils/prisma';

export default defineEventHandler(async (event) => {
  const { date } = getQuery(event) as { date?: string };

  const targetDate = date ? new Date(date) : new Date();
  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  const reviews = await prisma.prReview.findMany({
    where: { reviewedAt: { gte: startOfDay, lte: endOfDay } },
    orderBy: { reviewedAt: 'asc' },
  });

  if (reviews.length === 0) {
    return { markdown: `# PR Review Daily Report — ${targetDate.toISOString().slice(0, 10)}\n\nNo PRs reviewed today.` };
  }

  const totalBlockers = reviews.reduce((s, r) => s + r.blockers, 0);
  const totalMajors = reviews.reduce((s, r) => s + r.majors, 0);
  const totalMinors = reviews.reduce((s, r) => s + r.minors, 0);
  const totalSuggestions = reviews.reduce((s, r) => s + r.suggestions, 0);

  const dateStr = targetDate.toISOString().slice(0, 10);
  const lines: string[] = [
    `# PR Review Daily Report — ${dateStr}`,
    '',
    '## Summary',
    `- Total PRs reviewed: ${reviews.length}`,
    `- 🔴 Blockers: ${totalBlockers} | 🟡 Majors: ${totalMajors} | 🟢 Minors: ${totalMinors} | 💡 Suggestions: ${totalSuggestions}`,
    '',
    '## Reviews',
  ];

  for (const [i, r] of reviews.entries()) {
    lines.push(
      '',
      `### ${i + 1}. ${r.repoLabel}#${r.prNumber} — ${r.prTitle}`,
      `- **Author:** @${r.prAuthor}`,
      `- **Commit:** ${r.commitSha.slice(0, 7)}`,
      `- **Findings:** 🔴 ${r.blockers} | 🟡 ${r.majors} | 🟢 ${r.minors} | 💡 ${r.suggestions}`,
    );
    if (r.summaryComment) {
      lines.push(`- **Key Issues:** ${r.summaryComment}`);
    }
  }

  return { markdown: lines.join('\n') };
});
