import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { skinLoaders } from '../src/composition/skin-loaders';
import { SkinCatalog } from '../src/skins/catalog';

const builtins = resolve('src/renderer/public/skins');
const image = readFileSync(join(builtins, 'anelf/idle.png'));
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
  return { data, source, manifest, catalog: new SkinCatalog(builtins, data, probe, skinLoaders) };
}
describe('data-only skin packs', () => {
  it('discovers Live2D resources and aliases without a fixed motion vocabulary', () => {
    const f = fixture();
    const model = {
      Version: 3,
      FileReferences: {
        Moc: 'pet.moc3',
        Textures: ['pet.png'],
        Motions: { Idle: [{ File: 'nested/rest.motion3.json' }] },
        Expressions: [{ Name: 'smile', File: 'smile.exp3.json' }],
      },
    };
    mkdirSync(join(f.source, 'nested'));
    writeFileSync(join(f.source, 'pet.moc3'), 'MOC3');
    writeFileSync(
      join(f.source, 'nested/rest.motion3.json'),
      JSON.stringify({ Meta: { Duration: 1.5 } }),
    );
    writeFileSync(
      join(f.source, 'smile.exp3.json'),
      JSON.stringify({ Type: 'Live2D Expression', Parameters: [] }),
    );
    writeFileSync(join(f.source, 'pet.model3.json'), JSON.stringify(model));
    writeFileSync(
      join(f.source, 'manifest.json'),
      JSON.stringify({
        version: 2,
        id: 'cubism-test',
        name: 'Test',
        type: 'live2d',
        model: { file: 'pet.model3.json' },
        actions: { idle: { source: 'motion/Idle/0' }, custom: { source: 'expression/smile' } },
        bindings: { idle: 'idle', touch: 'custom' },
      }),
    );
    const id = f.catalog.import(f.source);
    f.catalog.select({ skinId: id, scale: 1 });
    expect(f.catalog.current().skin.actions.map(({ name }) => name)).toEqual(['idle', 'custom']);
    expect(f.catalog.asset(`embodied-skin://${id}/nested/rest.motion3.json`)).toBeDefined();
    expect(f.catalog.asset(`embodied-skin://${id}/%ZZ`)).toBeUndefined();
    model.FileReferences.Moc = '../outside.moc3';
    writeFileSync(join(f.source, 'pet.model3.json'), JSON.stringify(model));
    expect(() => f.catalog.import(f.source)).toThrow();
  });
  it('rejects directory junctions inside otherwise valid skin paths', () => {
    const f = fixture();
    const external = mkdtempSync(join(tmpdir(), 'skin-external-'));
    writeFileSync(join(external, 'pet.png'), image);
    symlinkSync(external, join(f.source, 'linked'), 'junction');
    f.manifest.animations.idle.file = 'linked/pet.png';
    writeFileSync(join(f.source, 'manifest.json'), JSON.stringify(f.manifest));
    expect(() => f.catalog.import(f.source)).toThrow('符号链接');
  });
  it('replaces retired defaults while keeping existing scale and imported skins', () => {
    const f = fixture();
    f.catalog.import(f.source);
    writeFileSync(join(f.data, 'appearance.json'), JSON.stringify({ skinId: 'fox', scale: 1.3 }));
    const restored = new SkinCatalog(builtins, f.data, probe, skinLoaders);
    expect(restored.current().skin.id).toBe('anelf');
    expect(restored.current().scale).toBe(1.3);
    expect(restored.snapshot().skins.map((skin) => skin.id)).toContain('custom-test');
  });
  it('imports, switches, restores and removes without changing the source pack', () => {
    const f = fixture();
    const id = f.catalog.import(f.source);
    f.catalog.select({ skinId: id, scale: 1.5 });
    const restored = new SkinCatalog(builtins, f.data, probe, skinLoaders);
    expect(restored.current().skin.preview!).toMatchObject({
      columns: 2,
      frames: 4,
      width: probe(image).width / 2,
    });
    expect(restored.current().scale).toBe(1.5);
    expect(restored.asset(restored.current().skin.preview!.url)).toEqual(image);
    expect(restored.asset('embodied-skin://custom-test/manifest.json')).toBeUndefined();
    restored.remove(id);
    expect(restored.current().skin.id).toBe('anelf');
    expect(readFileSync(join(f.source, 'pet.png'))).toEqual(image);
    expect(() => restored.remove('anelf')).toThrow('内置');
  });
  it('rejects path traversal, malformed grids, duplicate IDs and excessive scale', () => {
    const f = fixture();
    f.catalog.import(f.source);
    expect(() => f.catalog.import(f.source)).toThrow('已存在');
    expect(() => f.catalog.select({ skinId: 'anelf', scale: 10.01 })).toThrow();
    expect(() => f.catalog.select({ skinId: 'anelf', scale: 0.24 })).toThrow();
    f.manifest.animations.idle.file = '../secret.png';
    writeFileSync(join(f.source, 'manifest.json'), JSON.stringify(f.manifest));
    expect(() => f.catalog.import(f.source)).toThrow();
    f.manifest.animations.idle.file = 'pet.png';
    f.manifest.animations.idle.columns = 5;
    writeFileSync(join(f.source, 'manifest.json'), JSON.stringify(f.manifest));
    expect(() => f.catalog.import(f.source)).toThrow('尺寸');
  });
  it('preserves large size preferences across restarts', () => {
    const f = fixture();
    f.catalog.select({ skinId: 'anelf', scale: 8.75 });
    expect(new SkinCatalog(builtins, f.data, probe, skinLoaders).current().scale).toBe(8.75);
  });
});
