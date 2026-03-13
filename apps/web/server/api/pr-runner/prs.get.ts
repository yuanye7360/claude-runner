import { execSync } from 'node:child_process';

export interface GithubPR {
  number: number;
  title: string;
  html_url: string;
  head: { ref: string };
  base: { repo: { full_name: string; name: string } };
  draft: boolean;
  created_at: string;
}

export interface PrsByRepo {
  repo: string;
  prs: GithubPR[];
}

export default defineEventHandler(async (): Promise<PrsByRepo[]> => {
  let raw: string;
  try {
    raw = execSync(
      'gh search prs --author=@me --state=open --json number,title,repository,url,isDraft,createdAt --limit 100',
      { encoding: 'utf8', timeout: 15_000 },
    );
  } catch (error) {
    throw createError({
      statusCode: 502,
      message: `Failed to fetch PRs via gh CLI: ${(error as Error)?.message ?? error}`,
    });
  }

  type GhPR = {
    createdAt: string;
    isDraft: boolean;
    number: number;
    repository: { name: string; nameWithOwner: string };
    title: string;
    url: string;
  };

  const items: GhPR[] = JSON.parse(raw);
  const grouped = new Map<string, GithubPR[]>();

  for (const pr of items) {
    const full_name = pr.repository.nameWithOwner;
    if (!grouped.has(full_name)) grouped.set(full_name, []);
    const bucket = grouped.get(full_name) ?? [];
    grouped.set(full_name, bucket);
    bucket.push({
      number: pr.number,
      title: pr.title,
      html_url: pr.url,
      draft: pr.isDraft,
      created_at: pr.createdAt,
      head: { ref: '' },
      base: { repo: { full_name, name: pr.repository.name } },
    });
  }

  return [...grouped.entries()].map(([repo, prs]) => ({ repo, prs }));
});
