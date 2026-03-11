import fs from 'node:fs/promises';

import { format, getFileInfo, resolveConfig } from 'prettier';

/**
 * 格式化文件
 * @param filepath 文件路徑
 * @returns 格式化後的文件內容
 */
async function prettierFormat(filepath: string) {
  const prettierOptions = await resolveConfig(filepath, {});

  const fileInfo = await getFileInfo(filepath);

  const input = await fs.readFile(filepath, 'utf8');
  const output = await format(input, {
    ...prettierOptions,
    parser: fileInfo.inferredParser as any,
  });
  if (output !== input) {
    await fs.writeFile(filepath, output, 'utf8');
  }
  return output;
}

export { prettierFormat };
