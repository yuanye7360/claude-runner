import { createHash } from 'node:crypto';

/**
 * 生產基於內容的 hash，可自訂長度
 * @param content
 * @param hashLSize
 */
function generatorContentHash(content: string, hashLSize?: number) {
  const hash = createHash('md5').update(content, 'utf8').digest('hex');

  if (hashLSize) {
    return hash.slice(0, hashLSize);
  }

  return hash;
}

export { generatorContentHash };
