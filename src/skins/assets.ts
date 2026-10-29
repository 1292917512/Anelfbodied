import { lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { assetPath } from '../model/schema';
import type { AssetReader } from '../model/loader';

/** Reads bounded local assets and rejects symlinks at every path component. */
export class SkinAssets implements AssetReader {
  readonly files = new Map<string, Buffer>();
  private bytes = 0;
  constructor(
    private readonly directory: string,
    private readonly id: string,
    private readonly probe: (buffer: Buffer) => { width: number; height: number },
    private readonly source?: (path: string) => Buffer,
  ) {}
  read(input: string): Buffer {
    const path = assetPath.parse(input);
    const cached = this.files.get(path);
    if (cached) return cached;
    const bytes = this.source ? this.source(path) : this.local(path);
    if (
      bytes.length > 32_000_000 ||
      this.bytes + bytes.length > 128_000_000 ||
      this.files.size >= 2048
    )
      throw new Error('皮肤资源超限：单文件 32 MB、总量 128 MB、最多 2048 个文件');
    this.bytes += bytes.length;
    this.files.set(path, bytes);
    return bytes;
  }
  private local(path: string): Buffer {
    let current = this.directory;
    for (const part of path.split('/')) {
      current = join(current, part);
      if (lstatSync(current).isSymbolicLink()) throw new Error('皮肤资源不能是符号链接');
    }
    const stat = lstatSync(current);
    if (
      !stat.isFile() ||
      stat.size > 32_000_000 ||
      this.bytes + stat.size > 128_000_000 ||
      this.files.size >= 2048
    )
      throw new Error('皮肤资源超限：单文件 32 MB、总量 128 MB、最多 2048 个文件');
    return readFileSync(current);
  }
  json(path: string): unknown {
    const bytes = this.read(path);
    if (bytes.length > 8_000_000) throw new Error('JSON 资源过大');
    return JSON.parse(bytes.toString('utf8'));
  }
  url(path: string): string {
    const digest = createHash('sha256').update(this.read(path)).digest('hex').slice(0, 12);
    return `embodied-skin://${this.id}/${path.split('/').map(encodeURIComponent).join('/')}?v=${digest}`;
  }
  image(path: string) {
    const bytes = this.read(path);
    if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' || bytes.length < 24)
      throw new Error('仅支持 PNG 纹理');
    if (bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > 16_777_216)
      throw new Error('图片像素总量超过上限');
    const size = this.probe(bytes);
    if (size.width <= 0 || size.height <= 0 || size.width > 8192 || size.height > 8192)
      throw new Error('图片尺寸无效');
    return size;
  }
}
