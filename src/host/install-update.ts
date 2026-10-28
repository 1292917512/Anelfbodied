import { spawn } from 'node:child_process';

/** Starts a verified installer in the existing installation directory. */
export async function installUpdate(executable: string, installation: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(executable, ['/S', '--force-run', '/currentuser', `/D=${installation}`], {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      windowsVerbatimArguments: true,
    });
    child.once('error', reject);
    child.once('spawn', () => {
      child.unref();
      resolve();
    });
  });
}
