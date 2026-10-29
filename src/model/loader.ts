import { modelActionName } from '../protocol/model';
import { skinSchema, type Skin, type SkinManifest } from './schema';
export interface AssetReader {
  read(path: string): Buffer;
  json(path: string): unknown;
  url(path: string): string;
  image(path: string): { width: number; height: number };
}
export interface SkinLoader {
  id: string;
  name: string;
  normalize?(input: unknown): SkinManifest | undefined;
  detect?(files: string[], assets: AssetReader): SkinManifest | undefined;
  load(
    manifest: SkinManifest,
    assets: AssetReader,
  ): Pick<Skin, 'model' | 'actions' | 'bindings' | 'preview' | 'notices'>;
}
/** Resolves aliases and behavior bindings against the model's discovered sources. */
export function registerActions(
  manifest: SkinManifest,
  sources: Skin['actions'],
  defaults: Record<string, string>,
) {
  sources.forEach((source) => modelActionName.parse(source.name));
  const sourceMap = new Map(sources.map((action) => [action.name, action]));
  const aliases = Object.entries(manifest.actions);
  const actions = aliases.length
    ? aliases.map(([name, alias]) => {
        const source = sourceMap.get(alias.source);
        if (!source) throw new Error(`动作 ${name} 引用了不存在的资源：${alias.source}`);
        return {
          ...source,
          name,
          description: alias.description || source.description,
          durationMs: alias.durationMs ?? source.durationMs,
        };
      })
    : sources;
  const names = new Set(actions.map((action) => action.name));
  const bindings = { ...(aliases.length ? {} : defaults), ...manifest.bindings };
  for (const [behavior, name] of Object.entries(bindings))
    if (!names.has(name)) throw new Error(`行为 ${behavior} 引用了不存在的动作：${name}`);
  return {
    actions,
    bindings,
    aliases: Object.fromEntries(aliases.map(([name, action]) => [name, action.source])),
  };
}

export function parseManifest(input: unknown, loaders: readonly SkinLoader[]): SkinManifest {
  for (const loader of loaders) {
    const normalized = loader.normalize?.(input);
    if (normalized) return normalized;
  }
  return skinSchema.parse(input);
}
