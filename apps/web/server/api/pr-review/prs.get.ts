import { execSync } from 'node:child_process';

import prisma from '../../utils/prisma';
import { getRepoByLabel } from '../../utils/repo-mapping';

interface PrItem {
  number: number;
  title: string;
  author: string;
  headSha: string;
  updatedAt: string;
  htmlUrl: string;
  reviewStatus: 'not-reviewed' | 'outdated' | 'reviewed';
}

export default defineEventHandler(async (event) => {
  const { repoLabel } = getQuery(event) as { repoLabel?: string };
  if (!repoLabel) {
    throw createError({ statusCode: 400, message: 'repoLabel is required' });
  }

  const repo = await getRepoByLabel(repoLabel);
  if (!repo) {
    throw createError({
      statusCode: 404,
      message: `Repo "${repoLabel}" not found`,
    });
  }

  // Fetch open PRs via gh CLI
  let rawPrs: Array<{
    author: { login: string };
    headRefOid: string;
    number: number;
    title: string;
    updatedAt: string;
    url: string;
  }>;

  try {
    const out = execSync(
      `gh pr list --repo ${repo.githubRepo} --state open --json number,title,author,headRefOid,updatedAt,url --limit 50`,
      { encoding: 'utf8', timeout: 15_000 },
    );
    rawPrs = JSON.parse(out);
  } catch (error) {
    throw createError({
      statusCode: 502,
      message: `Failed to fetch PRs: ${error instanceof Error ? error.message : String(error)}`,
    });
  }

  // Fetch existing reviews for this repo
  const existingReviews = await prisma.prReview.findMany({
    where: { repoLabel },
    select: { prNumber: true, commitSha: true },
  });

  const reviewMap = new Map<number, Set<string>>();
  for (const r of existingReviews) {
    let shas = reviewMap.get(r.prNumber);
    if (!shas) {
      shas = new Set();
      reviewMap.set(r.prNumber, shas);
    }
    shas.add(r.commitSha);
  }

  const prs: PrItem[] = rawPrs.map((pr) => {
    const shas = reviewMap.get(pr.number);
    let reviewStatus: PrItem['reviewStatus'] = 'not-reviewed';
    if (shas) {
      reviewStatus = shas.has(pr.headRefOid) ? 'reviewed' : 'outdated';
    }
    return {
      number: pr.number,
      title: pr.title,
      author: pr.author.login,
      headSha: pr.headRefOid,
      updatedAt: pr.updatedAt,
      htmlUrl: pr.url,
      reviewStatus,
    };
  });

  return prs;
});
