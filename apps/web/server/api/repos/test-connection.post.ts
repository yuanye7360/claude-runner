import { execSync } from 'node:child_process';

export default defineEventHandler(async (event) => {
  const { githubRepo } = await readBody<{ githubRepo: string }>(event);

  if (!githubRepo) {
    throw createError({
      statusCode: 400,
      message: 'Missing required field: githubRepo',
    });
  }

  try {
    execSync(`gh api repos/${githubRepo} --jq .full_name`, {
      encoding: 'utf8',
      timeout: 10_000,
      stdio: 'pipe',
    });
    return { valid: true };
  } catch {
    return {
      valid: false,
      error: `無法存取 ${githubRepo}，請確認 repo 名稱和權限`,
    };
  }
});
