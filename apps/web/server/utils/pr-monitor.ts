// apps/web/server/utils/pr-monitor.ts
import { execSync } from 'node:child_process';

import prisma from './prisma';
import { getAllGhRepos } from './repo-mapping';

/** Resolve current GitHub username via gh CLI (cached) */
let _ghUser: null | string = null;
function getGhUser(): string {
  if (_ghUser) return _ghUser;
  try {
    _ghUser = execSync('gh api /user --jq .login', {
      encoding: 'utf8',
      timeout: 10_000,
    }).trim();
    return _ghUser;
  } catch {
    return '';
  }
}

interface GhPr {
  number: number;
  html_url: string;
}

interface GhComment {
  id: number;
  user: string;
  body: string;
  path?: string;
  line?: number;
  created_at: string;
}

/** Fetch new review comments for all open PRs by the current user */
export async function pollPrReviewComments(): Promise<number> {
  let newCount = 0;
  const ghUser = getGhUser();
  if (!ghUser) return 0;

  const repos = getAllGhRepos();

  for (const repo of repos) {
    try {
      const prsRaw = execSync(
        `gh api "/repos/${repo}/pulls?state=open" --jq '[.[] | select(.user.login == "${ghUser}") | {number, html_url}]'`,
        { encoding: 'utf8', timeout: 15_000 },
      );
      const prs = JSON.parse(prsRaw || '[]') as GhPr[];

      for (const pr of prs) {
        // Fetch inline review comments
        try {
          const reviewRaw = execSync(
            `gh api "/repos/${repo}/pulls/${pr.number}/comments" --jq '[.[] | {id, user: .user.login, body, path, line, created_at}]'`,
            { encoding: 'utf8', timeout: 15_000 },
          );
          const comments = JSON.parse(reviewRaw || '[]') as GhComment[];
          for (const c of comments) {
            const exists = await prisma.prReviewComment.findUnique({
              where: { type_commentId: { type: 'review', commentId: c.id } },
            });
            if (!exists) {
              await prisma.prReviewComment.create({
                data: {
                  prUrl: pr.html_url,
                  prNumber: pr.number,
                  repo,
                  commentId: c.id,
                  author: c.user,
                  body: c.body,
                  type: 'review',
                  path: c.path,
                  line: c.line,
                  createdAt: new Date(c.created_at),
                },
              });
              newCount++;
            }
          }
        } catch {
          /* skip review comments fetch failure */
        }

        // Fetch general issue comments
        try {
          const issueRaw = execSync(
            `gh api "/repos/${repo}/issues/${pr.number}/comments" --jq '[.[] | {id, user: .user.login, body, created_at}]'`,
            { encoding: 'utf8', timeout: 15_000 },
          );
          const comments = JSON.parse(issueRaw || '[]') as GhComment[];
          for (const c of comments) {
            const exists = await prisma.prReviewComment.findUnique({
              where: { type_commentId: { type: 'issue', commentId: c.id } },
            });
            if (!exists) {
              await prisma.prReviewComment.create({
                data: {
                  prUrl: pr.html_url,
                  prNumber: pr.number,
                  repo,
                  commentId: c.id,
                  author: c.user,
                  body: c.body,
                  type: 'issue',
                  createdAt: new Date(c.created_at),
                },
              });
              newCount++;
            }
          }
        } catch {
          /* skip issue comments fetch failure */
        }
      }
    } catch (error) {
      console.error(`[pr-monitor] Failed to poll ${repo}:`, error);
    }
  }

  return newCount;
}
