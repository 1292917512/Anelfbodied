import { z } from 'zod';

export const repository = '1292917512/DeskTop_Embodied';
const version = z.string().regex(/^\d+\.\d+\.\d+$/);
export const releaseSchema = z
  .object({
    version,
    url: z
      .string()
      .url()
      .refine((value) => value.startsWith(`https://github.com/${repository}/releases/download/`)),
    size: z
      .number()
      .int()
      .positive()
      .max(750 * 1024 * 1024),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export type Release = z.infer<typeof releaseSchema>;
export interface ReleaseSource {
  latest(signal: AbortSignal): Promise<Release | undefined>;
  download(release: Release, signal: AbortSignal): Promise<Response>;
}
export function newer(candidate: string, current: string): boolean {
  const a = version.parse(candidate).split('.').map(Number),
    b = version.parse(current).split('.').map(Number);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i]! > b[i]!;
  return false;
}

/** Accepts only stable releases and checksummed installers from this repository. */
export class GitHubReleases implements ReleaseSource {
  async latest(signal: AbortSignal): Promise<Release | undefined> {
    const response = await fetch(`https://api.github.com/repos/${repository}/releases/latest`, {
      signal,
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Embodied' },
    });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`检查更新失败（HTTP ${response.status}）`);
    const json = z
      .object({
        tag_name: z.string(),
        draft: z.boolean(),
        prerelease: z.boolean(),
        assets: z.array(
          z.object({
            name: z.string(),
            browser_download_url: z.string(),
            size: z.number(),
            digest: z.string().nullable(),
          }),
        ),
      })
      .parse(await response.json());
    if (json.draft || json.prerelease) return undefined;
    const nextVersion = version.parse(json.tag_name.replace(/^v/, ''));
    const name = `Embodied-Setup-${nextVersion}-x64.exe`;
    const asset = json.assets.find((asset) => asset.name === name);
    if (!asset || !asset.digest?.startsWith('sha256:'))
      throw new Error('发布版本缺少可验证的 Windows 安装包');
    const expected = `https://github.com/${repository}/releases/download/${json.tag_name}/${name}`;
    if (asset.browser_download_url !== expected) throw new Error('发布包地址不匹配');
    return releaseSchema.parse({
      version: nextVersion,
      url: expected,
      size: asset.size,
      sha256: asset.digest.slice(7),
    });
  }
  download(release: Release, signal: AbortSignal): Promise<Response> {
    return fetch(release.url, { signal });
  }
}
