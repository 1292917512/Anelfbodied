import { mkdirSync, openSync, closeSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';

/** Keeps application-owned state in one writable directory. */
export function prepareStorage(installation: string, override?: string) {
  const data = resolve(override ?? join(installation, 'data'));
  const paths = {
    data,
    cache: join(data, 'cache'),
    logs: join(data, 'logs'),
    crashes: join(data, 'crashes'),
    skins: join(data, 'skins'),
  };
  try {
    for (const path of Object.values(paths)) mkdirSync(path, { recursive: true });
    const probe = join(data, `.write-${randomUUID()}`);
    closeSync(openSync(probe, 'wx', 0o600));
    unlinkSync(probe);
    const guide = join(paths.skins, 'README.md');
    if (!existsSync(guide)) writeFileSync(guide, skinFolderGuide, { flag: 'wx' });
  } catch (cause) {
    throw new Error(`无法写入桌宠数据目录：${data}。请将程序安装到当前用户可写的目录。`, { cause });
  }
  return paths;
}

const skinFolderGuide = `# 自定义皮肤\n\n每套皮肤放在单独的目录中，目录名与 manifest.json 的 id 一致。\n请优先通过桌宠的“导入皮肤文件夹”导入，程序会验证图片和配置。\n手动修改已导入的资源后需要重启桌宠；请勿在程序运行时移动或删除正在使用的皮肤。\n\n安装目录的 docs/skins.md 包含完整协议，安装程序将示例放在本目录的 example-anelf 文件夹中。\n内置资源在程序包中，本目录统一保存示例和自定义皮肤。\n卸载会删除本目录，请将二次开发的源素材保存在安装目录之外。\n`;
