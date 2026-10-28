import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { _electron as electron } from '@playwright/test';
import { setTimeout as delay } from 'node:timers/promises';

const executablePath = resolve(process.argv[2]);
const installation = dirname(executablePath);
const data = join(installation, 'data');
const env = { ...process.env, EMBODIED_TEST: '1', EMBODIED_PORT: '0' };
delete env.ELECTRON_RUN_AS_NODE;
delete env.EMBODIED_DATA_DIR;
const application = await electron.launch({ executablePath, env });
try {
  assert.equal(
    await application.evaluate(({ app }) => app.getName()),
    basename(executablePath, '.exe'),
  );
  const paths = await application.evaluate(async ({ app }) => {
    await app.whenReady();
    return Object.fromEntries(
      ['userData', 'sessionData', 'logs', 'crashDumps'].map((name) => [name, app.getPath(name)]),
    );
  });
  assert.equal(paths.userData, data);
  for (const path of Object.values(paths)) assert.ok(path === data || path.startsWith(data + sep));
  const window = await application.firstWindow();
  await window.waitForFunction(() => Boolean(window.embodied));
  for (let i = 0; i < 100; i++) {
    try {
      await readFile(join(data, 'connection.json'));
      break;
    } catch {
      if (i === 99) throw new Error('Application did not start');
      await delay(100);
    }
  }
  await writeFile(join(data, 'upgrade-sentinel.txt'), 'preserve during upgrade');
  console.log('Installed application started with all runtime paths inside data.');
} finally {
  await application.close();
}
const log = await readFile(join(data, 'logs/runtime.log'), 'utf8');
assert.doesNotMatch(log, /uncaught-error|startup-failed|shutdown-failed/);
