import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readdirSync } from 'node:fs';
import { basename, dirname, extname, join, posix, resolve } from 'node:path';
import { setImmediate } from 'node:timers/promises';
import { assetPath, skinSchema } from '../../../model/schema';
import type { ModelCandidate, ModelReference, ModelSourceProvider } from '../../../model/source';
import { ModelArchive, parseJson, readLocal } from './archive';
import { LpkModel, workshopSchema } from './lpk';
import { normalizePackage } from './normalize';
import { discoverViewerEx } from './steam';

const hash = (value: string) => createHash('sha256').update(value).digest('hex').slice(0, 20);
function localResource(root: string, path: string): Buffer {
  let current = root;
  for (const part of assetPath.parse(path).split('/')) {
    current = join(current, part);
    if (lstatSync(current).isSymbolicLink()) throw new Error('模型资源不能是符号链接');
  }
  return readLocal(current, 32_000_000);
}
function packages(path: string) {
  if (extname(path).toLowerCase() === '.wpk') {
    const outer = new ModelArchive(readLocal(path));
    return outer.names
      .filter((file) => file.toLowerCase().endsWith('.lpk'))
      .map((file) => {
        const config = posix.join(posix.dirname(file), 'config.json');
        return {
          key: file,
          create: () =>
            new LpkModel(
              new ModelArchive(outer.read(file, 128_000_000)),
              outer.names.includes(config) ? workshopSchema.parse(outer.json(config)) : {},
            ),
        };
      });
  }
  return [
    {
      key: '',
      create: () => {
        const config = join(dirname(path), 'config.json');
        return new LpkModel(
          new ModelArchive(readLocal(path)),
          existsSync(config) ? workshopSchema.parse(parseJson(readLocal(config, 1_000_000))) : {},
        );
      },
    },
  ];
}
function inspect(path: string): ModelCandidate[] {
  if (path.toLowerCase().endsWith('.model3.json'))
    return [
      {
        id: hash(resolve(path).toLowerCase()),
        name: basename(path).replace(/\.model3\.json$/i, ''),
        format: 'Cubism',
        reference: { provider: 'live2d', path, entry: '' },
      },
    ];
  return packages(path).flatMap((pack) => {
    const model = pack.create();
    const entries = model.entries();
    return entries.map((entry, index) => ({
      id: hash(`${model.metadata.id}/${entry.path}`),
      name:
        (model.workshop.title || model.metadata.name || basename(path)) +
        (entries.length > 1 ? ` · ${entry.name} ${index + 1}` : ''),
      format: extname(path).slice(1).toUpperCase(),
      ...(entry.path.endsWith('.bin') ? { detail: '旧版模型包暂不支持，需要 Cubism 3+ 资源' } : {}),
      reference: { provider: 'live2d', path, entry: JSON.stringify([pack.key, entry.path]) },
    }));
  });
}

export const live2dLibrary: ModelSourceProvider = {
  id: 'live2d',
  name: 'Live2D / Live2DViewerEX',
  extensions: ['wpk', 'lpk', 'json'],
  discover: discoverViewerEx,
  async scan(input) {
    const root = resolve(input);
    if (lstatSync(root).isSymbolicLink()) throw new Error('模型库目录不能是符号链接');
    if (lstatSync(root).isFile()) return inspect(root);
    const models: ModelCandidate[] = [];
    const queue = [{ path: root, depth: 0 }];
    let count = 0;
    while (queue.length) {
      const item = queue.shift()!;
      for (const file of readdirSync(item.path, { withFileTypes: true })) {
        if (++count > 20000) throw new Error('模型库项目过多，请选择更具体的模型目录');
        const path = join(item.path, file.name);
        if (file.isSymbolicLink()) continue;
        if (
          file.isDirectory() &&
          item.depth < 8 &&
          !['bin', 'node_modules', '.git'].includes(file.name.toLowerCase())
        )
          queue.push({ path, depth: item.depth + 1 });
        if (file.isFile() && /(?:\.model3\.json|\.wpk|\.lpk)$/i.test(file.name)) {
          try {
            models.push(...inspect(path));
          } catch (error) {
            models.push({
              id: hash(path),
              name: file.name,
              format: extname(path).slice(1).toUpperCase(),
              reference: { provider: 'live2d', path, entry: '' },
              detail: error instanceof Error ? error.message : String(error),
            });
          }
          if (models.length > 1000) throw new Error('单个模型库最多浏览 1000 个模型');
          await setImmediate();
        }
      }
    }
    return models;
  },
  open(reference: ModelReference) {
    if (reference.path.toLowerCase().endsWith('.model3.json')) {
      const file = basename(reference.path);
      return {
        manifest: skinSchema.parse({
          version: 2,
          type: 'live2d',
          id: `live2d-${hash(resolve(reference.path).toLowerCase())}`,
          name: file.replace(/\.model3\.json$/i, '').slice(0, 60),
          model: { file },
        }),
        read: (path) => localResource(dirname(reference.path), path),
      };
    }
    const [key, entry] = JSON.parse(reference.entry) as [string, string];
    const pack = packages(reference.path).find((pack) => pack.key === key);
    if (!pack) throw new Error('模型包已改变，请刷新模型库');
    const model = pack.create();
    if (!model.entries().some((item) => item.path === entry))
      throw new Error('模型入口已改变，请刷新模型库');
    return normalizePackage(model.model(entry), (path) => model.read(path), {
      name: model.workshop.title || model.metadata.name || basename(reference.path),
      author: model.workshop.author,
      id: hash(`${model.metadata.id}/${entry}`),
    });
  },
};
