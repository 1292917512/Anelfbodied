import { readdir, mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/** Generates the skin example manifest and the installed application file list. */
export default async function afterPack(context) {
  const { appOutDir, packager } = context;
  const project = packager.projectDir;
  if (context.electronPlatformName !== 'win32') return;
  const generated = join(project, '.build/nsis');
  await mkdir(generated, { recursive: true });
  const source = join(project, 'src/renderer/public/skins/anelf');
  const manifest = JSON.parse(await readFile(join(source, 'manifest.json'), 'utf8'));
  await writeFile(
    join(generated, 'example-manifest.json'),
    JSON.stringify(
      {
        ...manifest,
        id: 'example-anelf',
        name: 'Anelf · 皮肤示例',
      },
      null,
      2,
    ),
  );
  const files = [],
    directories = [];
  async function collect(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isSymbolicLink())
        throw new Error('Installed files must not contain symbolic links');
      const name = relative(appOutDir, path).split(sep).join('\\');
      if (name === 'data' || name.startsWith('data\\'))
        throw new Error('Runtime data must not be packaged');
      if (entry.isDirectory()) {
        await collect(path);
        directories.push(name);
      } else files.push(name);
    }
  }
  await collect(appOutDir);
  const quote = (name) => name.replaceAll('$', '$$').replaceAll('"', '$\\"');
  const commands = [
    ...directories.map((name) => `Push "$INSTDIR\\${quote(name)}"\nCall un.CheckOwnedDirectory`),
    ...files.map((name) => `Push "$INSTDIR\\${quote(name)}"\nCall un.CheckDeletable`),
    ...files
      .sort()
      .map((name) =>
        [
          `Delete "$INSTDIR\\${quote(name)}"`,
          `IfFileExists "$INSTDIR\\${quote(name)}" 0 +4`,
          'MessageBox MB_ICONSTOP|MB_OK "文件仍被占用，请关闭桌宠后重试卸载。" /SD IDOK',
          'SetErrorLevel 2',
          'Abort',
        ].join('\n'),
      ),
    ...directories.map((name) => `RMDir "$INSTDIR\\${quote(name)}"`),
  ];
  await writeFile(join(generated, 'uninstall-files.nsh'), commands.join('\n') + '\n');
}
