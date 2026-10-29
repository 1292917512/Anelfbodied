import { existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';
import type { ModelLibrarySnapshot, ModelSourceProvider, ModelReference } from '../model/source';

const rootSchema = z
  .object({ provider: z.string().max(40), path: z.string().min(1).max(1024) })
  .strict();

/** Persists source locations and merges provider catalogs without owning model resources. */
export class ModelLibrary {
  private roots: ModelLibrarySnapshot['roots'] = [];
  private state: ModelLibrarySnapshot;
  private pending?: Promise<ModelLibrarySnapshot>;
  constructor(
    private readonly file: string,
    private readonly providers: readonly ModelSourceProvider[],
  ) {
    this.state = {
      configured: false,
      providers: providers.map(({ id, name }) => ({ id, name })),
      roots: [],
      models: [],
      issues: [],
    };
    try {
      if (existsSync(file)) {
        this.roots = z
          .array(rootSchema)
          .max(32)
          .parse(JSON.parse(readFileSync(file, 'utf8')));
        this.state.configured = true;
        this.state.roots = structuredClone(this.roots);
      }
    } catch {
      this.state.issues.push('模型库目录配置无效，请重新添加目录');
    }
  }
  snapshot(): ModelLibrarySnapshot {
    return structuredClone(this.state);
  }
  async add(input: unknown): Promise<ModelLibrarySnapshot> {
    if (this.pending) await this.pending;
    const root = rootSchema.parse(input);
    if (!this.providers.some((item) => item.id === root.provider))
      throw new Error('模型来源未注册');
    root.path = resolve(root.path);
    if (
      !this.roots.some(
        (item) =>
          item.provider === root.provider && item.path.toLowerCase() === root.path.toLowerCase(),
      )
    ) {
      if (this.roots.length >= 32) throw new Error('最多添加 32 个模型库目录');
      this.roots.push(root);
      this.save();
    }
    return this.refresh();
  }
  async remove(input: unknown): Promise<ModelLibrarySnapshot> {
    if (this.pending) await this.pending;
    const root = rootSchema.parse(input);
    this.roots = this.roots.filter(
      (item) => item.provider !== root.provider || item.path !== root.path,
    );
    this.save();
    return this.refresh();
  }
  reference(id: string): ModelReference {
    const model = this.state.models.find((item) => item.id === id);
    if (!model || model.detail) throw new Error(model?.detail || '模型列表已改变，请刷新后重试');
    return model.reference;
  }
  refresh(discover = false): Promise<ModelLibrarySnapshot> {
    if (this.pending) return this.pending;
    this.pending = this.scan(discover).finally(() => {
      this.pending = undefined;
    });
    return this.pending;
  }
  private save() {
    writeFileSync(`${this.file}.tmp`, JSON.stringify(this.roots, null, 2));
    renameSync(`${this.file}.tmp`, this.file);
    this.state.configured = true;
  }
  private async scan(discover: boolean): Promise<ModelLibrarySnapshot> {
    const issues: string[] = [];
    if (discover) {
      for (const provider of this.providers) {
        for (const path of await provider.discover())
          if (
            this.roots.length < 32 &&
            !this.roots.some(
              (root) =>
                root.provider === provider.id && root.path.toLowerCase() === path.toLowerCase(),
            )
          )
            this.roots.push({ provider: provider.id, path });
      }
      this.save();
    }
    const models = new Map<string, ModelLibrarySnapshot['models'][number]>();
    for (const root of this.roots) {
      try {
        const provider = this.providers.find((item) => item.id === root.provider);
        if (!provider) throw new Error('模型来源未注册');
        for (const model of await provider.scan(root.path))
          if (!models.has(model.id)) models.set(model.id, model);
      } catch (error) {
        issues.push(`${root.path}：${error instanceof Error ? error.message : String(error)}`);
      }
    }
    this.state = {
      ...this.state,
      roots: structuredClone(this.roots),
      models: [...models.values()],
      issues,
    };
    return this.snapshot();
  }
}
