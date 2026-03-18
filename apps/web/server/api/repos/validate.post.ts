import { execSync } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';

export default defineEventHandler(async (event) => {
  const { path } = await readBody<{ path: string }>(event);

  if (!path) {
    throw createError({
      statusCode: 400,
      message: 'Missing required field: path',
    });
  }

  if (!existsSync(path)) {
    return { valid: false, error: '路徑不存在' };
  }

  if (!statSync(path).isDirectory()) {
    return { valid: false, error: '路徑不是目錄' };
  }

  try {
    execSync('git rev-parse --git-dir', {
      cwd: path,
      timeout: 5000,
      stdio: 'pipe',
    });
  } catch {
    return { valid: false, error: '不是有效的 Git repository' };
  }

  return { valid: true };
});
