import { createHash } from 'node:crypto';
import { z } from 'zod';
import { assetPath } from '../../../model/schema';
import { ModelArchive, parseJson } from './archive';

const metadataSchema = z.object({
  type: z.enum(['STM_1_0', 'STD2_0', 'STD_1_0']),
  id: z.string(),
  encrypt: z.union([z.string(), z.boolean()]).optional(),
  name: z.string().optional(),
  list: z
    .array(
      z.object({
        character: z.string().optional(),
        costume: z.array(
          z.object({
            name: z.string().optional(),
            path: z.string(),
          }),
        ),
      }),
    )
    .max(100)
    .default([]),
});
export const workshopSchema = z.object({
  title: z.string().optional(),
  author: z.string().optional(),
  fileId: z.union([z.string(), z.number()]).optional(),
  metaData: z.string().optional(),
  lpkFile: z.string().optional(),
  previewFile: z.string().optional(),
  file: z.string().optional(),
});
type Workshop = z.infer<typeof workshopSchema>;

/** Decodes ViewerEX resource bytes; package commands are never evaluated. */
export class LpkModel {
  readonly metadata: z.infer<typeof metadataSchema>;
  private fileId: string;
  constructor(
    private readonly archive: ModelArchive,
    readonly workshop: Workshop = {},
  ) {
    const hashed = createHash('md5').update('config.mlve').digest('hex');
    this.metadata = metadataSchema.parse(
      archive.json(archive.names.includes(hashed) ? hashed : 'config.mlve'),
    );
    this.fileId = String(workshop.fileId ?? '');
  }
  entries() {
    return this.metadata.list.flatMap((character) =>
      character.costume
        .filter((costume) => costume.path)
        .map((costume) => ({
          path: costume.path,
          name: costume.name || character.character || this.metadata.name || 'Live2D',
        })),
    );
  }
  model(path: string): Record<string, unknown> {
    const candidates = [
      ...new Set([this.fileId, this.workshop.lpkFile?.replace(/\.lpk$/i, '') ?? '']),
    ];
    for (const id of candidates) {
      this.fileId = id;
      try {
        return z.record(z.string(), z.unknown()).parse(parseJson(this.read(path)));
      } catch {
        /* Try the package's own alternative workshop id. */
      }
    }
    throw new Error('无法读取 LPK 模型，请检查配套 config.json 是否完整、模型是否为 Cubism 3+');
  }
  read(path: string): Buffer {
    assetPath.parse(path);
    const bytes = this.archive.read(path);
    const meta = this.metadata;
    if (
      meta.encrypt === 'false' ||
      meta.encrypt === false ||
      (meta.type === 'STM_1_0' && meta.encrypt === undefined)
    )
      return bytes;
    if (meta.type === 'STM_1_0' && (!this.fileId || !this.workshop.metaData))
      throw new Error('Steam LPK 需要同目录下完整的 config.json');
    const seed =
      meta.type === 'STM_1_0'
        ? meta.id + this.fileId + path + this.workshop.metaData
        : meta.id + path;
    let key = 0;
    for (let i = 0; i < seed.length; i++) key = (Math.imul(key, 31) + seed.charCodeAt(i)) >>> 0;
    let state = key;
    for (let i = 0; i < bytes.length; i++) {
      if (i % 1024 === 0) state = key;
      state = Math.floor((214013 * state + 2531011) / 65536) & 65535;
      bytes[i] = bytes[i]! ^ (state & 255);
    }
    return bytes;
  }
}
