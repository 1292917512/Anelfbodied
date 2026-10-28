import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { defaultSkinId } from './builtin';
import {
  appearanceSchema,
  skinSchema,
  type Appearance,
  type Skin,
  type SkinManifest,
} from './schema';

interface Pack {
  manifest: SkinManifest;
  skin: Skin;
  assets: Map<string, Buffer>;
}
type Probe = (buffer: Buffer) => { width: number; height: number };

/** Validates data-only skin packs and serves only their declared images. */
export class SkinCatalog {
  private readonly packs = new Map<string, Pack>();
  private selected = { skinId: defaultSkinId, scale: 1 };
  private readonly settings: string;
  private readonly imported: string;
  constructor(
    builtins: string,
    data: string,
    private readonly probe: Probe,
    private readonly report: (message: string) => void = () => {},
  ) {
    this.imported = resolve(data, 'skins');
    this.settings = join(data, 'appearance.json');
    mkdirSync(this.imported, { recursive: true });
    for (const [root, builtin] of [
      [builtins, true],
      [this.imported, false],
    ] as const) {
      for (const entry of readdirSync(root, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
        .slice(0, builtin ? 32 : 16)) {
        try {
          const pack = this.read(join(root, entry.name), builtin);
          if (pack.skin.id !== entry.name) throw new Error('Skin directory does not match its id');
          if (!this.packs.has(pack.skin.id)) this.packs.set(pack.skin.id, pack);
        } catch {
          this.report(`Skipped invalid skin: ${entry.name}`);
        }
      }
    }
    if (!this.packs.has(defaultSkinId)) throw new Error('The default skin is missing or invalid');
    if (existsSync(this.settings)) {
      try {
        const selected = appearanceSchema.parse(JSON.parse(readFileSync(this.settings, 'utf8')));
        this.selected = {
          ...selected,
          skinId: this.packs.has(selected.skinId) ? selected.skinId : defaultSkinId,
        };
      } catch {
        this.report('Invalid appearance settings; using the built-in skin');
      }
    }
  }
  snapshot(): Appearance {
    return structuredClone({
      ...this.selected,
      skins: [...this.packs.values()].map((pack) => pack.skin),
    });
  }
  current(): { skin: Skin; scale: number } {
    return {
      skin: structuredClone(this.packs.get(this.selected.skinId)!.skin),
      scale: this.selected.scale,
    };
  }
  select(input: unknown): void {
    const selected = appearanceSchema.parse(input);
    if (!this.packs.has(selected.skinId)) throw new Error('皮肤不存在');
    writeFileSync(`${this.settings}.tmp`, JSON.stringify(selected), { mode: 0o600 });
    renameSync(`${this.settings}.tmp`, this.settings);
    this.selected = selected;
  }
  import(directory: string): string {
    if ([...this.packs.values()].filter((pack) => !pack.skin.builtin).length >= 16)
      throw new Error('最多导入 16 套皮肤，请先移除不用的皮肤');
    const pack = this.read(directory, false);
    if (this.packs.has(pack.skin.id))
      throw new Error('已存在同名 ID 的皮肤，请修改 manifest.json 中的 id');
    const destination = resolve(this.imported, pack.skin.id);
    if (existsSync(destination)) throw new Error('皮肤目录已存在，请更换皮肤 ID');
    const staging = resolve(this.imported, '.import');
    if (
      staging !== join(this.imported, '.import') ||
      destination !== join(this.imported, pack.skin.id)
    )
      throw new Error('Invalid skin path');
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging);
    try {
      writeFileSync(join(staging, 'manifest.json'), JSON.stringify(pack.manifest, null, 2));
      for (const [file, bytes] of pack.assets) writeFileSync(join(staging, file), bytes);
      renameSync(staging, destination);
      this.packs.set(pack.skin.id, pack);
      return pack.skin.id;
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
  }
  remove(id: string): void {
    const pack = this.packs.get(id);
    if (!pack || pack.skin.builtin) throw new Error('不能移除内置皮肤');
    if (this.selected.skinId === id) this.select({ ...this.selected, skinId: defaultSkinId });
    const directory = resolve(this.imported, id);
    if (directory !== join(this.imported, pack.manifest.id)) throw new Error('Invalid skin path');
    rmSync(directory, { recursive: true, force: true });
    this.packs.delete(id);
  }
  asset(url: string): Buffer | undefined {
    const parsed = new URL(url);
    const file = parsed.pathname.slice(1);
    return this.packs.get(parsed.hostname)?.assets.get(file);
  }
  private read(directory: string, builtin: boolean): Pack {
    const manifestFile = join(directory, 'manifest.json');
    if (lstatSync(manifestFile).size > 16000 || lstatSync(manifestFile).isSymbolicLink())
      throw new Error('皮肤配置文件无效');
    const manifest = skinSchema.parse(JSON.parse(readFileSync(manifestFile, 'utf8')));
    const skin: Skin = {
      id: manifest.id,
      name: manifest.name,
      author: manifest.author,
      license: manifest.license,
      builtin,
      animations: {} as Skin['animations'],
    };
    const assets = new Map<string, Buffer>();
    let bytes = 0;
    for (const [motion, spec] of Object.entries(manifest.animations)) {
      if (!assets.has(spec.file)) {
        const file = join(directory, spec.file),
          stat = lstatSync(file);
        if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8_000_000)
          throw new Error('皮肤图片必须是文件夹内的 PNG 图片');
        bytes += stat.size;
        if (bytes > 8_000_000) throw new Error('每套皮肤的图片总量最多 8 MB');
        assets.set(spec.file, readFileSync(file));
      }
      const image = assets.get(spec.file)!;
      if (image.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a')
        throw new Error('仅支持 PNG 图片');
      if (image.length < 24 || image.readUInt32BE(16) * image.readUInt32BE(20) > 16_777_216)
        throw new Error('图片像素总量超过上限');
      const size = this.probe(image),
        rows = Math.ceil(spec.frames / spec.columns);
      if (
        spec.columns > spec.frames ||
        size.width <= 0 ||
        size.height <= 0 ||
        size.width > 8192 ||
        size.height > 8192 ||
        size.width % spec.columns ||
        size.height % rows
      )
        throw new Error('序列帧的尺寸、列数或帧数不匹配');
      skin.animations[motion as keyof Skin['animations']] = {
        ...spec,
        width: size.width / spec.columns,
        height: size.height / rows,
        url: `embodied-skin://${manifest.id}/${spec.file}?v=${createHash('sha256').update(image).digest('hex').slice(0, 12)}`,
      };
    }
    return { manifest, skin, assets };
  }
}
