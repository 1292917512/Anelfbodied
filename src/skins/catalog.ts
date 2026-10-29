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
import { dirname, join, resolve } from 'node:path';
import { SkinAssets } from './assets';
import { parseManifest, type SkinLoader } from '../model/loader';
import { defaultSkinId } from './builtin';
import { appearanceSchema, type Appearance, type Skin, type SkinManifest } from '../model/schema';
import type { ModelReference, ModelSourceProvider } from '../model/source';
import { z } from 'zod';

const referenceSchema = z
  .object({ provider: z.string().max(40), path: z.string().max(1024), entry: z.string().max(1024) })
  .strict();

interface Pack {
  manifest: SkinManifest;
  skin: Skin;
  assets: Map<string, Buffer>;
}
type Probe = (buffer: Buffer) => { width: number; height: number };

/** Stores validated skin packs and serves only their declared assets. */
export class SkinCatalog {
  private readonly packs = new Map<string, Pack>();
  private selected = { skinId: defaultSkinId, scale: 1 };
  private readonly settings: string;
  private readonly imported: string;
  constructor(
    builtins: string,
    data: string,
    private readonly probe: Probe,
    private readonly loaders: readonly SkinLoader[],
    private readonly report: (message: string) => void = () => {},
    private readonly sources: readonly ModelSourceProvider[] = [],
  ) {
    if (new Set(loaders.map((loader) => loader.id)).size !== loaders.length)
      throw new Error('Duplicate model type');
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
          const directory = join(root, entry.name);
          const reference = join(directory, 'source.json');
          const pack =
            !builtin && existsSync(reference)
              ? this.linked(this.readReference(reference))
              : this.read(directory, builtin);
          if (pack.skin.id !== entry.name) throw new Error('Skin directory does not match its id');
          if (!this.packs.has(pack.skin.id)) {
            this.checkCapacity(pack);
            this.packs.set(pack.skin.id, pack);
          }
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
      types: this.loaders.map(({ id, name }) => ({ id, name })),
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
    let generated: SkinManifest | undefined;
    if (!existsSync(join(directory, 'manifest.json'))) {
      const files = readdirSync(directory);
      const assets = new SkinAssets(directory, 'import', this.probe);
      generated = this.loaders.map((loader) => loader.detect?.(files, assets)).find(Boolean);
      if (!generated) throw new Error('未识别到模型，请选择含 manifest.json 的皮肤文件夹');
    }
    const pack = this.read(directory, false, generated);
    if (this.packs.has(pack.skin.id))
      throw new Error('已存在同名 ID 的皮肤，请修改 manifest.json 中的 id');
    this.checkCapacity(pack);
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
      for (const [file, bytes] of pack.assets) {
        mkdirSync(dirname(join(staging, file)), { recursive: true });
        writeFileSync(join(staging, file), bytes);
      }
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
  link(reference: ModelReference): string {
    const pack = this.linked(referenceSchema.parse(reference));
    const previous = this.packs.get(pack.skin.id);
    if (previous && !previous.skin.linked) throw new Error('此 ID 已被本地皮肤使用');
    if (!previous && [...this.packs.values()].filter((pack) => !pack.skin.builtin).length >= 16)
      throw new Error('最多添加 16 套皮肤，请先移除不用的皮肤');
    this.checkCapacity(pack);
    const directory = join(this.imported, pack.skin.id);
    const existed = existsSync(directory);
    if (
      existed &&
      (lstatSync(directory).isSymbolicLink() || !existsSync(join(directory, 'source.json')))
    )
      throw new Error('皮肤目录已存在，不能覆盖');
    if (!existed) mkdirSync(directory);
    try {
      const temp = join(directory, 'source.json.tmp');
      writeFileSync(temp, JSON.stringify(reference, null, 2));
      renameSync(temp, join(directory, 'source.json'));
      this.packs.set(pack.skin.id, pack);
    } catch (error) {
      if (!existed) rmSync(directory, { recursive: true, force: true });
      throw error;
    }
    return pack.skin.id;
  }
  private readReference(path: string): ModelReference {
    if (lstatSync(path).isSymbolicLink() || lstatSync(path).size > 16000)
      throw new Error('模型引用无效');
    return referenceSchema.parse(JSON.parse(readFileSync(path, 'utf8')));
  }
  private linked(reference: ModelReference): Pack {
    const provider = this.sources.find((item) => item.id === reference.provider);
    if (!provider) throw new Error('模型来源未注册');
    const source = provider.open(reference);
    return this.load(
      source.manifest,
      false,
      new SkinAssets('', source.manifest.id, this.probe, source.read),
      true,
    );
  }
  asset(url: string): Buffer | undefined {
    try {
      const parsed = new URL(url);
      const file = decodeURIComponent(parsed.pathname.slice(1));
      return this.packs.get(parsed.hostname)?.assets.get(file);
    } catch {
      return undefined;
    }
  }
  private read(directory: string, builtin: boolean, generated?: unknown): Pack {
    if (lstatSync(directory).isSymbolicLink()) throw new Error('皮肤目录不能是符号链接');
    const manifestFile = join(directory, 'manifest.json');
    if (
      !generated &&
      (lstatSync(manifestFile).size > 512000 || lstatSync(manifestFile).isSymbolicLink())
    )
      throw new Error('皮肤配置文件无效');
    const manifest = parseManifest(
      generated ?? JSON.parse(readFileSync(manifestFile, 'utf8')),
      this.loaders,
    );
    return this.load(manifest, builtin, new SkinAssets(directory, manifest.id, this.probe));
  }
  private load(manifest: SkinManifest, builtin: boolean, assets: SkinAssets, linked = false): Pack {
    const loader = this.loaders.find((entry) => entry.id === manifest.type);
    if (!loader) throw new Error('未注册的模型类型：' + manifest.type);
    const loaded = loader.load(manifest, assets);
    const skin: Skin = {
      id: manifest.id,
      name: manifest.name,
      author: manifest.author,
      license: manifest.license,
      type: manifest.type,
      builtin,
      linked,
      ...loaded,
    };
    return { manifest, skin, assets: assets.files };
  }
  private checkCapacity(pack: Pack): void {
    const bytes = (item: Pack) =>
      [...item.assets.values()].reduce((sum, asset) => sum + asset.length, 0);
    if (
      [...this.packs.values()]
        .filter((item) => item.skin.id !== pack.skin.id)
        .reduce((sum, item) => sum + bytes(item), bytes(pack)) > 256_000_000
    )
      throw new Error('已加载皮肤资源总量最多 256 MB，请先移除不用的皮肤');
  }
}
