import { build } from 'esbuild';
import { build as buildUi } from 'vite';
import { rm, mkdir, readFile, cp } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
await rm(new URL('../dist/', import.meta.url), { recursive: true, force: true });
await build({
  entryPoints: { main: 'src/host/main.ts', stdio: 'src/transports/stdio.ts' },
  outdir: 'dist/host',
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  sourcemap: true,
});
await build({
  entryPoints: ['src/host/preload.ts'],
  outfile: 'dist/host/preload.cjs',
  bundle: true,
  platform: 'node',
  format: 'cjs',
  external: ['electron'],
});
await buildUi();

const output = resolve('dist/renderer');
const manifests = JSON.parse(await readFile('src/composition/model-assets.json', 'utf8'));
for (const manifest of manifests) {
  const assets = JSON.parse(await readFile(manifest, 'utf8'));
  for (const [source, target] of Object.entries(assets)) {
    const destination = resolve(output, target);
    const path = relative(output, destination);
    if (!path || path.startsWith('..') || isAbsolute(path))
      throw new Error('Invalid component asset destination');
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination, { recursive: true, errorOnExist: true, force: false });
  }
}
