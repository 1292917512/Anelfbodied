import { readdir, mkdir, writeFile, copyFile } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

/** Publishes a skin example and an exact list of installed application files. */
export default async function afterPack(context) {
  const { appOutDir, packager } = context;
  const project = packager.projectDir;
  const example = join(appOutDir, 'examples/skins/example-fox');
  await mkdir(example, { recursive: true });
  const fox = join(project, 'src/renderer/public/skins/fox');
  await copyFile(join(fox, 'fox.png'), join(example, 'idle.png'));
  await copyFile(join(fox, 'LICENSE.txt'), join(example, 'LICENSE.txt'));
  await writeFile(
    join(example, 'manifest.json'),
    JSON.stringify(
      {
        version: 1,
        id: 'example-fox',
        name: '狐狸 · 皮肤示例',
        author: 'Microsoft Fluent Emoji',
        license: 'MIT',
        animations: { idle: { file: 'idle.png', columns: 1, frames: 1, fps: 1 } },
      },
      null,
      2,
    ),
  );
  await copyFile(join(project, 'docs/skins.md'), join(appOutDir, 'examples/skins/README.md'));
  if (context.electronPlatformName !== 'win32') return;
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
    ...files
      .sort()
      .map((name) =>
        [
          `Delete "$INSTDIR\\${quote(name)}"`,
          `IfFileExists "$INSTDIR\\${quote(name)}" 0 +4`,
          'MessageBox MB_ICONSTOP|MB_OK "文件仍被占用，请关闭桌宠后重试卸载。"',
          'SetErrorLevel 2',
          'Abort',
        ].join('\n'),
      ),
    ...directories.map((name) => `RMDir "$INSTDIR\\${quote(name)}"`),
  ];
  const generated = join(project, 'build/.generated');
  await mkdir(generated, { recursive: true });
  await writeFile(join(generated, 'uninstall-files.nsh'), commands.join('\n') + '\n');
}
