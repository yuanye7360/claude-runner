import { execSync } from 'node:child_process';

import { getGitHubOrg } from '../../utils/app-settings';

export default defineEventHandler(async (event) => {
  const { githubRepo } = await readBody<{ githubRepo: string }>(event);

  if (!githubRepo) {
    throw createError({ statusCode: 400, message: 'Missing required field: githubRepo' });
  }

  let org: string;
  try {
    org = await getGitHubOrg();
  } catch {
    return { valid: false, error: '請先設定 GitHub Org' };
  }

  const fullRepo = `${org}/${githubRepo}`;

  try {
    execSync(`gh api repos/${fullRepo} --jq .full_name`, {
      encoding: 'utf8',
      timeout: 10_000,
      stdio: 'pipe',
    });
    return { valid: true };
  } catch {
    return { valid: false, error: `無法存取 ${fullRepo}，請確認 repo 名稱和權限` };
  }
});
