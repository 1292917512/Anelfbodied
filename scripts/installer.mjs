import { build } from 'electron-builder';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const project = fileURLToPath(new URL('../', import.meta.url));
const metadata = JSON.parse(await readFile(join(project, 'package.json'), 'utf8'));
const staging = join(project, metadata.build.directories.output);
const delivery = join(project, 'release');
const artifacts = await build({
  projectDir: project,
  win: ['nsis'],
  x64: true,
  publish: 'never',
  ...(process.argv.includes('--prepackaged') ? { prepackaged: join(staging, 'win-unpacked') } : {}),
});
const name = `${metadata.productName}-Setup-${metadata.version}-x64.exe`;
const source = join(staging, name);
if (!artifacts.some((path) => resolve(path) === source))
  throw new Error('The build did not produce the expected installer');
await mkdir(delivery, { recursive: true });
const digest = createHash('sha256');
for await (const chunk of createReadStream(source)) digest.update(chunk);
await rename(source, join(delivery, name));
await writeFile(join(delivery, 'SHA256SUMS.txt'), `${digest.digest('hex')}  ${name}\n`);
for (const entry of await readdir(delivery, { withFileTypes: true })) {
  if (
    entry.isFile() &&
    entry.name !== name &&
    entry.name.startsWith(`${metadata.productName}-Setup-`) &&
    entry.name.endsWith('-x64.exe')
  )
    await rm(join(delivery, entry.name));
}
console.log(`Installer: ${join(delivery, name)}`);
