import { posix } from 'node:path';

/**
 * 將給定的檔案路徑轉換為 POSIX 風格。
 * @param {string} pathname - 原始檔案路徑。
 */
function toPosixPath(pathname: string) {
  return pathname.split(`\\`).join(posix.sep);
}

export { toPosixPath };
