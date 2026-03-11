import type { Ora } from 'ora';

import ora from 'ora';

interface SpinnerOptions {
  failedText?: string;
  successText?: string;
  title: string;
}

/**
 * 顯示加載動畫
 * @param options 選項
 * @param options.title 加載動畫的標題（必需）
 * @param options.successText 成功時的文本
 * @param options.failedText 失敗時的文本
 * @param callback 回調
 * @returns 回調的結果
 */
export async function spinner<T>(
  { failedText, successText, title }: SpinnerOptions,
  callback: () => Promise<T>,
): Promise<T> {
  const loading: Ora = ora(title).start();

  try {
    const result = await callback();
    loading.succeed(successText || 'Success!');
    return result;
  } catch (error) {
    loading.fail(failedText || 'Failed!');
    throw error;
  } finally {
    loading.stop();
  }
}
