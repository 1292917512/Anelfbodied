import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { SkinCatalog } from '../src/skins/catalog';

const builtins = resolve('src/renderer/public/skins');
const image = readFileSync(join(builtins, 'fox/fox.png'));
const probe = (buffer: Buffer) => ({
  width: buffer.readUInt32BE(16),
  height: buffer.readUInt32BE(20),
});
function fixture() {
  const data = mkdtempSync(join(tmpdir(), 'embodied-skins-'));
  const source = join(data, 'source');
  mkdirSync(source);
  const manifest = {
    version: 1,
    id: 'custom-test',
    name: '测试皮肤',
    animations: { idle: { file: 'pet.png', columns: 2, frames: 4, fps: 8 } },
  };
  writeFileSync(join(source, 'pet.png'), image);
  writeFileSync(join(source, 'manifest.json'), JSON.stringify(manifest));
  return { data, source, manifest, catalog: new SkinCatalog(builtins, data, probe) };
}
describe('data-only skin packs', () => {
  it('imports, switches, restores and removes without changing the source pack', () => {
    const f = fixture();
    const id = f.catalog.import(f.source);
    f.catalog.select({ skinId: id, scale: 1.5 });
    const restored = new SkinCatalog(builtins, f.data, probe);
    expect(restored.current().skin.animations.idle).toMatchObject({
      columns: 2,
      frames: 4,
      width: probe(image).width / 2,
    });
    expect(restored.current().scale).toBe(1.5);
    expect(restored.asset(restored.current().skin.animations.idle.url)).toEqual(image);
    expect(restored.asset('embodied-skin://custom-test/manifest.json')).toBeUndefined();
    restored.remove(id);
    expect(restored.current().skin.id).toBe('fox');
    expect(readFileSync(join(f.source, 'pet.png'))).toEqual(image);
    expect(() => restored.remove('fox')).toThrow('内置');
  });
  it('rejects path traversal, malformed grids, duplicate IDs and excessive scale', () => {
    const f = fixture();
    f.catalog.import(f.source);
    expect(() => f.catalog.import(f.source)).toThrow('已存在');
    expect(() => f.catalog.select({ skinId: 'fox', scale: 4 })).toThrow();
    f.manifest.animations.idle.file = '../secret.png';
    writeFileSync(join(f.source, 'manifest.json'), JSON.stringify(f.manifest));
    expect(() => f.catalog.import(f.source)).toThrow();
    f.manifest.animations.idle.file = 'pet.png';
    f.manifest.animations.idle.columns = 3;
    writeFileSync(join(f.source, 'manifest.json'), JSON.stringify(f.manifest));
    expect(() => f.catalog.import(f.source)).toThrow('尺寸');
  });
});
