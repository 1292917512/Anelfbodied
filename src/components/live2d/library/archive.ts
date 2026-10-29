import { unzipSync } from 'fflate';
import { lstatSync, readFileSync } from 'node:fs';
import { assetPath } from '../../../model/schema';

export function readLocal(path: string, limit = 128_000_000): Buffer {
  const stat = lstatSync(path);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > limit)
    throw new Error('模型文件不是普通文件或超过大小限制');
  return readFileSync(path);
}
export function parseJson(bytes: Buffer): unknown {
  if (bytes.length > 8_000_000) throw new Error('模型配置过大');
  return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
}

/** Reads selected ZIP entries in memory without extracting paths onto disk. */
export class ModelArchive {
  readonly names: string[] = [];
  constructor(private readonly bytes: Buffer) {
    if (bytes.length > 128_000_000) throw new Error('模型包超过 128 MB');
    let total = 0;
    const seen = new Set<string>();
    unzipSync(bytes, {
      filter: (file) => {
        const name = file.name.replace(/\/$/, '');
        assetPath.parse(name);
        const key = name.toLowerCase();
        if (seen.has(key)) throw new Error('模型包存在重复路径');
        seen.add(key);
        total += file.originalSize;
        if (seen.size > 2048 || total > 256_000_000 || file.originalSize > 128_000_000)
          throw new Error('模型包解压大小或文件数量超限');
        if (!file.name.endsWith('/')) this.names.push(file.name);
        return false;
      },
    });
  }
  read(name: string, limit = 32_000_000): Buffer {
    assetPath.parse(name);
    const files = unzipSync(this.bytes, {
      filter: (file) => {
        if (file.name !== name) return false;
        if (file.originalSize > limit) throw new Error('模型资源超过大小限制');
        return true;
      },
    });
    const bytes = files[name];
    if (!bytes) throw new Error(`模型包缺少资源：${name}`);
    return Buffer.from(bytes);
  }
  json(name: string): unknown {
    return parseJson(this.read(name, 8_000_000));
  }
}
