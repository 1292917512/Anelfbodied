import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { readLocal } from './archive';

/** Searches Steam library manifests and standard install locations, without a whole-disk crawl. */
export async function discoverViewerEx(): Promise<string[]> {
  if (process.platform !== 'win32') return [];
  const steam = new Set<string>();
  try {
    const { stdout } = await promisify(execFile)(
      'reg.exe',
      ['query', 'HKCU\\Software\\Valve\\Steam', '/v', 'SteamPath'],
      { windowsHide: true, timeout: 3000 },
    );
    const path = stdout.match(/SteamPath\s+REG_SZ\s+(.+)/)?.[1]?.trim();
    if (path) steam.add(resolve(path));
  } catch {
    /* Portable Steam installations may not register a path. */
  }
  for (const drive of 'CDEFGHIJKLMNOPQRSTUVWXYZ') {
    for (const folder of ['SteamLibrary', 'Steam', 'Program Files (x86)/Steam']) {
      const path = resolve(`${drive}:\\`, folder);
      if (existsSync(join(path, 'steamapps'))) steam.add(path);
    }
  }
  for (const root of [...steam]) {
    try {
      const text = readLocal(join(root, 'steamapps/libraryfolders.vdf'), 1_000_000).toString(
        'utf8',
      );
      for (const match of text.matchAll(/"path"\s*"([^"]+)"/g))
        steam.add(resolve(match[1]!.replaceAll('\\\\', '\\')));
    } catch {
      /* A library can be offline or have no manifest. */
    }
  }
  const roots = new Set<string>();
  for (const library of steam) {
    let folder = 'Live2DViewerEX';
    try {
      const manifest = readLocal(
        join(library, 'steamapps/appmanifest_616720.acf'),
        1_000_000,
      ).toString('utf8');
      const installed = manifest.match(/"installdir"\s*"([^"\\/]+)"/i)?.[1];
      if (installed) folder = installed;
    } catch {
      /* Fall back to the application's standard folder. */
    }
    const app = join(library, 'steamapps/common', folder);
    if (existsSync(app)) roots.add(app);
    const workshop = join(library, 'steamapps/workshop/content/616720');
    if (existsSync(workshop)) roots.add(workshop);
  }
  return [...roots];
}
