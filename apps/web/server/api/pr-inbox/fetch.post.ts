import { execSync } from 'node:child_process';

import pLimit from 'p-limit';

import { getSlackCache, refreshSlackCache } from '../../utils/pr-inbox-cache';
import prisma from '../../utils/prisma';
import { getAllRepos } from '../../utils/repo-mapping';

interface PrInboxItem {
  headSha: string;
  htmlUrl: string;
  prAuthor: string;
  prNumber: number;
  prTitle: string;
  repo: string;
  repoLabel: null | string;
  requestedAt: string;
  reviewStatus: 'closed' | 'not-reviewed' | 'outdated' | 'reviewed';
  slackTs: string;
  slackUser: string;
}

interface PrInboxResponse {
  cachedAt: string;
  channel: string;
  fetchedAt: string;
  items: PrInboxItem[];
}

const PR_URL_RE = /https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/pull\/(\d+)/g;
const EXCLUSION_PATTERNS = [/PR Review Status/i, /該 code review 囉/];

function isBotUser(userId: string): boolean {
  return userId.startsWith('B');
}

function extractPrUrls(
  text: string,
): Array<{ prNumber: number; repo: string; url: string }> {
  const results: Array<{ prNumber: number; repo: string; url: string }> = [];
  for (const m of text.matchAll(PR_URL_RE)) {
    results.push({
      prNumber: Number.parseInt(m[2], 10),
      repo: m[1],
      url: m[0],
    });
  }
  return results;
}

export default defineEventHandler(async (_event): Promise<PrInboxResponse> => {
  // 1. Get cached Slack messages (or trigger first fetch)
  let cache = getSlackCache();
  if (!cache) {
    const fresh = await refreshSlackCache();
    if (!fresh) {
      throw createError({
        statusCode: 400,
        message:
          'PR Inbox Slack channel not configured. Go to Settings → Integrations.',
      });
    }
    cache = fresh;
  }

  // 2. Filter + extract PR URLs, deduplicate by repo#prNumber
  const seen = new Map<
    string,
    {
      prNumber: number;
      repo: string;
      slackTs: string;
      slackUser: string;
      url: string;
    }
  >();

  for (const msg of cache.messages) {
    const text = msg.text;

    // Exclusion rules
    if (EXCLUSION_PATTERNS.some((p) => p.test(text))) continue;
    const prUrls = extractPrUrls(text);
    if (isBotUser(msg.userId) && prUrls.length === 0) continue;

    for (const pr of prUrls) {
      const key = `${pr.repo}#${pr.prNumber}`;
      if (!seen.has(key)) {
        seen.set(key, {
          prNumber: pr.prNumber,
          repo: pr.repo,
          slackTs: msg.ts,
          slackUser: msg.userId,
          url: pr.url,
        });
      }
    }
  }

  // 3. Prepare lookups
  const allRepos = await getAllRepos();
  const repoLabelMap = new Map(allRepos.map((r) => [r.githubRepo, r.label]));

  const allPrReviews = await prisma.prReview.findMany({
    select: { commitSha: true, prNumber: true, repoLabel: true },
  });
  const reviewLookup = new Map<string, Map<number, Set<string>>>();
  for (const r of allPrReviews) {
    let byPr = reviewLookup.get(r.repoLabel);
    if (!byPr) {
      byPr = new Map();
      reviewLookup.set(r.repoLabel, byPr);
    }
    let shas = byPr.get(r.prNumber);
    if (!shas) {
      shas = new Set();
      byPr.set(r.prNumber, shas);
    }
    shas.add(r.commitSha);
  }

  // 4. Enrich each PR (parallel gh pr view)
  const limit = pLimit(5);

  const itemResults = await Promise.all(
    [...seen.values()].map((entry) =>
      limit(async () => {
        let prMeta: null | {
          author: { login: string };
          headRefOid: string;
          state: string;
          title: string;
          url: string;
        } = null;

        try {
          const out = execSync(
            `gh pr view ${entry.prNumber} --repo ${entry.repo} --json title,author,headRefOid,state,url`,
            { encoding: 'utf8', timeout: 15_000 },
          );
          prMeta = JSON.parse(out);
        } catch {
          return null;
        }

        if (!prMeta) return null;

        const repoLabel = repoLabelMap.get(entry.repo) ?? null;

        let reviewStatus: PrInboxItem['reviewStatus'];
        if (prMeta.state === 'CLOSED' || prMeta.state === 'MERGED') {
          reviewStatus = 'closed';
        } else {
          const byPr = repoLabel ? reviewLookup.get(repoLabel) : undefined;
          const shas = byPr?.get(entry.prNumber);
          if (!shas) {
            reviewStatus = 'not-reviewed';
          } else if (shas.has(prMeta.headRefOid)) {
            reviewStatus = 'reviewed';
          } else {
            reviewStatus = 'outdated';
          }
        }

        const requestedAt = new Date(
          Number.parseFloat(entry.slackTs) * 1000,
        ).toISOString();

        return {
          headSha: prMeta.headRefOid,
          htmlUrl: prMeta.url || entry.url,
          prAuthor: prMeta.author.login,
          prNumber: entry.prNumber,
          prTitle: prMeta.title,
          repo: entry.repo,
          repoLabel,
          requestedAt,
          reviewStatus,
          slackTs: entry.slackTs,
          slackUser: entry.slackUser,
        } satisfies PrInboxItem;
      }),
    ),
  );

  const items = itemResults.filter(
    (item): item is PrInboxItem => item !== null,
  );
  items.sort(
    (a, b) =>
      new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime(),
  );

  return {
    cachedAt: cache.fetchedAt,
    channel: cache.channel,
    fetchedAt: new Date().toISOString(),
    items,
  };
});
