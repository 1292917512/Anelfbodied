import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { prepareStorage } from '../src/host/storage';

describe('installation storage', () => {
  it('keeps every runtime directory below data and preserves existing files', () => {
    const root = mkdtempSync(join(tmpdir(), 'embodied-layout-'));
    const paths = prepareStorage(root);
    expect(paths.data).toBe(join(root, 'data'));
    for (const path of Object.values(paths)) expect(path.startsWith(paths.data)).toBe(true);
    writeFileSync(join(paths.data, 'appearance.json'), '{"skinId":"fox","scale":1.2}');
    expect(prepareStorage(root)).toEqual(paths);
    expect(readFileSync(join(paths.data, 'appearance.json'), 'utf8')).toContain('1.2');
    expect(readFileSync(join(paths.skins, 'README.md'), 'utf8')).toContain('manifest.json');
  });
  it('supports an explicit isolated path and fails without falling back elsewhere', () => {
    const root = mkdtempSync(join(tmpdir(), 'embodied-layout-'));
    const custom = join(root, 'isolated');
    expect(prepareStorage(root, custom).data).toBe(custom);
    const invalid = join(root, 'not-a-directory');
    writeFileSync(invalid, 'occupied');
    expect(() => prepareStorage(root, invalid)).toThrow('无法写入桌宠数据目录');
  });
});
