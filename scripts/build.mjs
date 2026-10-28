import { build } from 'esbuild';
import { build as buildUi } from 'vite';
import { rm } from 'node:fs/promises';
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
