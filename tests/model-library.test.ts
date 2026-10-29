import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { ModelArchive } from '../src/components/live2d/library/archive';
import { live2dLibrary } from '../src/components/live2d/library/provider';
import { SkinCatalog } from '../src/skins/catalog';
import { ModelLibrary } from '../src/skins/library';
import { skinLoaders } from '../src/composition/skin-loaders';
import { waveDuration } from '../src/components/live2d/sound-info';

const json = (value: unknown) => Buffer.from(JSON.stringify(value));
function wave() {
  const bytes = Buffer.alloc(44 + 16000);
  bytes.write('RIFF');
  bytes.writeUInt32LE(bytes.length - 8, 4);
  bytes.write('WAVEfmt ', 8);
  bytes.writeUInt32LE(16, 16);
  bytes.writeUInt16LE(1, 20);
  bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(8000, 24);
  bytes.writeUInt32LE(16000, 28);
  bytes.writeUInt16LE(2, 32);
  bytes.writeUInt16LE(16, 34);
  bytes.write('data', 36);
  bytes.writeUInt32LE(16000, 40);
  return bytes;
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'embodied-library-'));
  const model = {
    Version: 3,
    FileReferences: {
      Moc: 'pet.bin3',
      Textures: ['texture.bin3'],
      Motions: {
        Idle: [{ File: 'rest.bin3' }],
        Greet: [{ Sound: 'voice.bin3', Text: '你好' }],
        Unsupported: [{ Command: 'open.exe' }],
      },
    },
  };
  const bytes = zipSync({
    'config.mlve': json({
      type: 'STM_1_0',
      id: 'library-test',
      encrypt: 'false',
      name: 'Test',
      list: [{ costume: [{ path: 'model.bin3' }] }],
    }),
    'model.bin3': json(model),
    'pet.bin3': Buffer.from('MOC3'),
    'texture.bin3': readFileSync('src/renderer/public/skins/anelf/idle.png'),
    'rest.bin3': json({ Meta: { Duration: 0.2 } }),
    'voice.bin3': wave(),
  });
  const file = join(root, 'test.wpk');
  writeFileSync(
    file,
    zipSync({
      'test/model.lpk': bytes,
      'test/config.json': json({ title: 'Library fixture', lpkFile: 'model.lpk' }),
    }),
  );
  const catalog = () =>
    new SkinCatalog(
      resolve('src/renderer/public/skins'),
      root,
      (buffer) => ({ width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }),
      skinLoaders,
      () => {},
      [live2dLibrary],
    );
  return { root, file, catalog };
}

describe('read-only model libraries', () => {
  it('links WPK without extracting assets, restores references and removes only the reference', async () => {
    const f = fixture(),
      original = readFileSync(f.file);
    const candidate = (await live2dLibrary.scan(f.file))[0]!;
    const catalog = f.catalog(),
      id = catalog.link(candidate.reference);
    catalog.select({ skinId: id, scale: 1 });
    const skin = catalog.current().skin;
    expect(skin.linked).toBe(true);
    expect(skin.actions).toMatchObject([
      { name: 'motion/Idle/0', kind: 'motion' },
      { name: 'motion/Greet/0', kind: 'sound', durationMs: 1000 },
    ]);
    expect(skin.notices).toHaveLength(1);
    expect(readdirSync(join(f.root, 'skins', id))).toEqual(['source.json']);
    expect(catalog.link(candidate.reference)).toBe(id);
    expect(catalog.snapshot().skins).toHaveLength(2);
    const restored = f.catalog();
    expect(restored.current().skin.actions).toEqual(skin.actions);
    restored.remove(id);
    expect(restored.current().skin.id).toBe('anelf');
    expect(readFileSync(f.file)).toEqual(original);
  });
  it('recovers a moved reference without duplicating the skin and fails closed on missing resources', async () => {
    const f = fixture(),
      candidate = (await live2dLibrary.scan(f.file))[0]!,
      catalog = f.catalog();
    const id = catalog.link(candidate.reference);
    renameSync(f.file, join(f.root, 'moved.wpk'));
    const restored = f.catalog();
    expect(restored.snapshot().skins).toHaveLength(1);
    const moved = (await live2dLibrary.scan(join(f.root, 'moved.wpk')))[0]!;
    expect(restored.link(moved.reference)).toBe(id);
    expect(restored.snapshot().skins).toHaveLength(2);
    expect(() => restored.link(candidate.reference)).toThrow();
    expect(restored.snapshot().skins).toHaveLength(2);
  });
  it('deduplicates package entries across locations and records unavailable libraries', async () => {
    const f = fixture();
    const library = new ModelLibrary(join(f.root, 'library.json'), [live2dLibrary]);
    await library.add({ provider: 'live2d', path: f.file });
    writeFileSync(join(f.root, 'copy.wpk'), readFileSync(f.file));
    const state = await library.add({ provider: 'live2d', path: join(f.root, 'copy.wpk') });
    expect(state.models).toHaveLength(1);
    expect(state.roots).toHaveLength(2);
    rmSync(f.file);
    const refreshed = await library.refresh();
    expect(refreshed.issues).toHaveLength(1);
    expect(refreshed.models).toHaveLength(1);
    const restored = new ModelLibrary(join(f.root, 'library.json'), [live2dLibrary]);
    expect(restored.snapshot()).toMatchObject({ configured: true, roots: state.roots });
    await restored.remove(state.roots[0]);
    await restored.remove(state.roots[1]);
    expect(
      new ModelLibrary(join(f.root, 'library.json'), [live2dLibrary]).snapshot(),
    ).toMatchObject({ configured: true, roots: [] });
  });
  it('rejects traversal and case-colliding ZIP entries without writing them', () => {
    expect(
      () => new ModelArchive(Buffer.from(zipSync({ '../outside': Buffer.from('no') }))),
    ).toThrow();
    expect(
      () =>
        new ModelArchive(Buffer.from(zipSync({ one: Buffer.from('a'), ONE: Buffer.from('b') }))),
    ).toThrow('重复');
    expect(() => new ModelArchive(Buffer.from('not a zip'))).toThrow();
  });
  it('reads only selected bounded archive entries and validates WAV timing', () => {
    const archive = new ModelArchive(
      Buffer.from(zipSync({ a: Buffer.alloc(20), b: Buffer.from('ok') })),
    );
    expect(archive.read('b').toString()).toBe('ok');
    expect(() => archive.read('a', 10)).toThrow('大小');
    expect(() => archive.read('missing')).toThrow('缺少');
    expect(waveDuration(wave())).toBe(1000);
    expect(waveDuration(wave().subarray(0, 50))).toBeUndefined();
  });
});
