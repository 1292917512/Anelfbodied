import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { Updater } from '../src/updates/updater';
import { GitHubReleases, newer, type ReleaseSource } from '../src/updates/source';

const bytes = Buffer.from('verified installer contents');
const release = {
  version: '0.2.0',
  url: 'https://github.com/1292917512/DeskTop_Embodied/releases/download/v0.2.0/Embodied-Setup-0.2.0-x64.exe',
  size: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
};
const source: ReleaseSource = {
  latest: async () => release,
  download: async () => new Response(bytes),
};
const folder = () => mkdtempSync(join(tmpdir(), 'embodied-update-'));

describe('application upgrades', () => {
  it('downloads a verified installer, resumes it, detects tampering, and cleans obsolete files', async () => {
    const directory = folder();
    const updater = new Updater(directory, '0.1.1', true, source);
    await updater.check();
    await updater.download();
    expect(updater.snapshot()).toMatchObject({ phase: 'ready', received: bytes.length });
    expect(readFileSync(join(directory, 'installer.exe'))).toEqual(bytes);
    const resumed = new Updater(directory, '0.1.1', true, source);
    expect(await resumed.installer()).toBe(join(directory, 'installer.exe'));
    const damaged = new Updater(directory, '0.1.1', true, source);
    writeFileSync(join(directory, 'installer.exe'), 'modified');
    await expect(damaged.installer()).rejects.toThrow('安装包已变化');
    expect(damaged.snapshot().phase).toBe('error');
    await updater.download();
    const upgraded = new Updater(directory, '0.2.0', true, source);
    expect(upgraded.snapshot().phase).toBe('idle');
    expect(existsSync(join(directory, 'installer.exe'))).toBe(false);
    expect(existsSync(join(directory, 'release.json'))).toBe(false);
  });
  it('rejects checksum mismatch and removes partial files', async () => {
    const directory = folder();
    const updater = new Updater(directory, '0.1.1', true, {
      ...source,
      download: async () => new Response(Buffer.alloc(bytes.length)),
    });
    await updater.check();
    await updater.download();
    expect(updater.snapshot()).toMatchObject({
      phase: 'error',
      detail: '安装包校验失败，请重新下载',
    });
    expect(existsSync(join(directory, 'installer.exe'))).toBe(false);
    expect(existsSync(join(directory, 'download.part'))).toBe(false);
  });
  it('cancels a streaming download and waits for cleanup on shutdown', async () => {
    const directory = folder();
    const updater = new Updater(directory, '0.1.1', true, {
      ...source,
      download: async (_release, signal) =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(bytes.subarray(0, 4));
              signal.addEventListener('abort', () => controller.error(new Error('aborted')), {
                once: true,
              });
            },
          }),
        ),
    });
    await updater.check();
    const downloading = updater.download();
    await vi.waitFor(() => expect(updater.snapshot().received).toBe(4));
    await updater.close();
    await downloading;
    expect(updater.snapshot()).toMatchObject({ phase: 'available', detail: '已取消' });
    expect(existsSync(join(directory, 'download.part'))).toBe(false);
  });
  it('selects only a newer stable release with the expected asset and digest', async () => {
    expect(newer('0.10.0', '0.9.9')).toBe(true);
    expect(newer('0.1.1', '0.1.1')).toBe(false);
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          tag_name: 'v0.2.0',
          draft: false,
          prerelease: false,
          assets: [
            {
              name: 'Embodied-Setup-0.2.0-x64.exe',
              browser_download_url: release.url,
              size: release.size,
              digest: `sha256:${release.sha256}`,
            },
          ],
        }),
      ),
    );
    try {
      expect(await new GitHubReleases().latest(new AbortController().signal)).toEqual(release);
      fetchMock.mockResolvedValue(new Response(null, { status: 404 }));
      expect(await new GitHubReleases().latest(new AbortController().signal)).toBeUndefined();
    } finally {
      fetchMock.mockRestore();
    }
  });
});
