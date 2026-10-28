import {
  app,
  ipcMain,
  Menu,
  Tray,
  nativeImage,
  safeStorage,
  dialog,
  protocol,
  shell,
  clipboard,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { Controller } from '../runtime/controller';
import { Journal } from '../runtime/journal';
import { startServer } from '../transports/http';
import { AnelfClient } from '../integrations/anelf/client';
import { Settings } from './settings';
import { createRendererDriver } from './renderer-driver';
import type { Snapshot } from '../contracts/client';
import { diagnostics } from './diagnostics';
import { createDesktop } from './desktop';
import { SkinCatalog } from '../skins/catalog';
import { PointerBoundary } from './pointer-boundary';
import { prepareStorage } from './storage';
import { Updater } from '../updates/updater';
import { GitHubReleases } from '../updates/source';
import { installUpdate } from './install-update';
import { productName } from '../shared/product';
import { ConnectionService } from '../application/connection';
import { applicationIcon } from '../skins/builtin';

const directory = dirname(fileURLToPath(import.meta.url));
protocol.registerSchemesAsPrivileged([
  { scheme: 'embodied-skin', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);
app.setName(productName);
const installation = app.isPackaged ? dirname(app.getPath('exe')) : app.getAppPath();
const storage = (() => {
  try {
    const paths = prepareStorage(installation, process.env.EMBODIED_DATA_DIR);
    app.setPath('userData', paths.data);
    app.setPath('sessionData', paths.cache);
    app.setPath('crashDumps', paths.crashes);
    app.setAppLogsPath(paths.logs);
    return paths;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!process.env.EMBODIED_TEST) dialog.showErrorBox(`${productName} 无法启动`, message);
    console.error(message);
    process.exit(1);
  }
})();
app.commandLine.appendSwitch('disk-cache-size', String(64 * 1024 * 1024));
const log = diagnostics(storage.logs);
log('starting', app.getVersion());
process.on('uncaughtExceptionMonitor', (error) =>
  log('uncaught-error', error.stack ?? error.message),
);
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void app
    .whenReady()
    .then(start)
    .catch((error) => {
      log('startup-failed', error instanceof Error ? error.message : 'Unknown error');
      console.error(
        `${productName} startup failed:`,
        error instanceof Error ? error.message : 'Unknown error',
      );
      if (!process.env.EMBODIED_TEST)
        dialog.showErrorBox(
          `${productName} 无法启动`,
          error instanceof Error ? error.message : '未知错误',
        );
      app.exit(1);
    });
}

async function start(): Promise<void> {
  const data = app.getPath('userData');
  mkdirSync(data, { recursive: true });
  const skins = new SkinCatalog(
    join(directory, '../renderer/skins'),
    data,
    (buffer) => nativeImage.createFromBuffer(buffer).getSize(),
    (message) => log('skin-warning', message),
  );
  protocol.handle('embodied-skin', (request) => {
    const bytes = skins.asset(request.url);
    return bytes
      ? new Response(new Uint8Array(bytes), {
          headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=3600' },
        })
      : new Response(null, { status: 404 });
  });
  const settings = new Settings(join(data, 'settings.json'), {
    available: () =>
      safeStorage.isEncryptionAvailable() &&
      (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'),
    encrypt: (text) => safeStorage.encryptString(text),
    decrypt: (buffer) => safeStorage.decryptString(buffer),
  });
  const preload = join(directory, 'preload.cjs');
  let quitting = false;
  let pendingInstaller: string | undefined;
  const updater = new Updater(
    join(data, 'updates'),
    app.getVersion(),
    app.isPackaged && process.platform === 'win32' && process.arch === 'x64',
    new GitHubReleases(),
  );
  const desktop = createDesktop(preload, log, () => quitting);
  const { pet, panel } = desktop;
  const petContents = pet.webContents,
    panelContents = panel.webContents;
  const pointer = new PointerBoundary(pet);
  const driver = createRendererDriver(petContents);
  const controller = new Controller(driver, new Journal(join(data, 'receipts.json')));
  const anelf = new AnelfClient(controller);
  const connection = new ConnectionService(settings, anelf);
  const tokenFile = join(data, 'control-token');
  const apiToken = existsSync(tokenFile)
    ? readFileSync(tokenFile, 'utf8').trim()
    : randomBytes(32).toString('hex');
  writeFileSync(tokenFile, apiToken, { mode: 0o600 });
  const port = z.coerce
    .number()
    .int()
    .min(0)
    .max(65535)
    .parse(process.env.EMBODIED_PORT ?? 46187);
  const local = await startServer(controller, apiToken, port, connection);
  const snapshot = (): Snapshot => ({
    connection: anelf.snapshot(),
    receipts: controller.list(),
    reportableIds: anelf.reportableIds(),
    settings: settings.view(),
    settingsRevision: connection.revision,
    connectionUpdating: connection.updating,
    apiUrl: local.url,
    apiToken,
    appearance: skins.snapshot(),
    dataDirectory: storage.data,
    update: updater.snapshot(),
    secureStorage:
      safeStorage.isEncryptionAvailable() &&
      (process.platform !== 'linux' || safeStorage.getSelectedStorageBackend() !== 'basic_text'),
  });
  const publish = () => {
    const state = snapshot();
    if (!panel.isDestroyed()) panelContents.send('app:state', state);
    if (!pet.isDestroyed()) petContents.send('pet:state', companion(state));
  };
  const companion = (state: Snapshot) => {
    const { status, detail, draft, busy } = state.connection;
    return {
      status,
      detail,
      draft,
      busy,
      appearance: skins.current(),
      active: state.receipts.some((receipt) => ['accepted', 'running'].includes(receipt.status)),
    };
  };
  controller.on('receipt', publish);
  anelf.on('state', publish);
  connection.on('state', publish);
  updater.on('state', publish);
  const ensurePanel = (event: IpcMainInvokeEvent) => {
    if (event.sender !== panelContents || event.senderFrame !== panelContents.mainFrame)
      throw new Error('Untrusted renderer');
  };
  const stop = async () => {
    const sessions = new Set(
      controller
        .list('external')
        .filter((receipt) => ['accepted', 'running'].includes(receipt.status))
        .map((receipt) => receipt.session),
    );
    const pending: Promise<unknown>[] = [
      anelf.stop(),
      ...[...sessions].map((session) => controller.cancel('external', { session })),
    ];
    const results = await Promise.allSettled(pending);
    publish();
    const failure = results.find((result) => result.status === 'rejected');
    if (failure?.status === 'rejected') throw failure.reason;
  };
  const handle = (name: string, action: (input: unknown) => unknown, allowPet = false) =>
    ipcMain.handle(name, (event, input: unknown) => {
      if (quitting) throw new Error('Client is shutting down');
      if (!(
        allowPet &&
        event.sender === petContents &&
        event.senderFrame === petContents.mainFrame
      ))
        ensurePanel(event);
      return action(input);
    });
  handle('app:snapshot', snapshot);
  handle('app:configure', (input) => connection.configure(input));
  handle('app:connect', () => connection.control('connect'));
  handle('app:disconnect', () => connection.control('disconnect'));
  handle('app:copy-mcp', () =>
    clipboard.writeText(
      JSON.stringify(
        {
          mcpServers: {
            [productName]: {
              type: 'http',
              url: `${local.url}/mcp`,
              headers: { Authorization: `Bearer ${apiToken}` },
            },
          },
        },
        null,
        2,
      ),
    ),
  );
  handle('app:send', (input) => anelf.send(z.string().max(16000).parse(input)), true);
  handle('app:stop', stop, true);
  handle('pet:snapshot', () => companion(snapshot()), true);
  handle('app:report', (input) => anelf.reportReceipt(z.string().parse(input)));
  handle('app:appearance', (input) => {
    skins.select(input);
    desktop.scale(skins.current().scale);
    publish();
  });
  handle('app:import-skin', async () => {
    const picked = await dialog.showOpenDialog(panel, {
      title: '选择含 manifest.json 的皮肤文件夹',
      properties: ['openDirectory'],
    });
    if (picked.canceled || !picked.filePaths[0]) return;
    const skinId = skins.import(picked.filePaths[0]);
    skins.select({ skinId, scale: skins.current().scale });
    publish();
  });
  handle('app:remove-skin', (input) => {
    skins.remove(z.string().parse(input));
    publish();
  });
  handle('app:open-location', async (input) => {
    const location = z.enum(['data', 'skins', 'skin-guide']).parse(input);
    const paths = {
      data: storage.data,
      skins: storage.skins,
      'skin-guide': join(installation, 'docs/skins.md'),
    };
    const error = await shell.openPath(paths[location]);
    if (error) throw new Error(error);
  });
  handle('app:update', async (input) => {
    const action = z.enum(['check', 'download', 'cancel', 'install']).parse(input);
    if (action === 'check') await updater.check();
    else if (action === 'download') await updater.download();
    else if (action === 'cancel') updater.cancel();
    else {
      pendingInstaller = await updater.installer();
      setImmediate(() => app.quit());
    }
  });
  desktop.scale(skins.current().scale);
  const listen = (name: string, action: (event: IpcMainEvent, ...args: unknown[]) => void) =>
    ipcMain.on(name, (event, ...args: unknown[]) => {
      if (!quitting) action(event, ...args);
    });
  listen('app:show', (event, input: unknown) => {
    const view = z.enum(['history', 'settings', 'receipts', 'appearance']).safeParse(input);
    if (!view.success) return;
    if (event.sender === petContents || event.sender === panelContents)
      desktop.showPanel(view.data);
  });
  listen('pet:focus', (event, focus: unknown) => {
    if (event.sender === petContents) {
      if (focus === true) pet.focus();
      else if (focus === false) pet.blur();
    }
  });
  listen('app:hide', (event) => {
    if (event.sender === panelContents) panel.hide();
  });
  listen('pet:position', (event, input: unknown) => {
    if (event.sender !== petContents) return;
    const point = z
      .object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
      .safeParse(input);
    if (point.success) desktop.position(point.data);
  });
  listen('pet:capture', (event, enabled: unknown) => {
    if (event.sender === petContents && typeof enabled === 'boolean') pointer.capture(enabled);
  });
  const regionSchema = z
    .array(
      z.object({
        x: z.number().min(-1000).max(100000),
        y: z.number().min(-1000).max(100000),
        width: z.number().nonnegative().max(100000),
        height: z.number().nonnegative().max(100000),
      }),
    )
    .max(4);
  listen('pet:regions', (event, input: unknown) => {
    if (event.sender !== petContents) return;
    const regions = regionSchema.safeParse(input);
    if (regions.success) pointer.setRegions(regions.data);
  });
  listen('pet:ready', (event) => {
    if (event.sender === petContents) driver.ready();
  });
  ipcMain.on('pet:result', (event, id: unknown, result: unknown) => {
    if (event.sender === petContents && typeof id === 'string') driver.acknowledge(id, result);
  });
  const page = join(directory, '../renderer/index.html');
  await Promise.all([pet.loadFile(page, { query: { view: 'pet' } }), panel.loadFile(page)]);
  pet.showInactive();
  const tray = new Tray(
    nativeImage
      .createFromPath(join(directory, '../renderer', applicationIcon))
      .resize({ width: 24, height: 24 }),
  );
  tray.setToolTip(`${productName} · 桌面伙伴`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: '打开控制浮层', click: () => desktop.showPanel() },
      {
        label: '显示 / 隐藏桌宠',
        click: () => (pet.isVisible() ? pet.hide() : pet.showInactive()),
      },
      { label: '移到鼠标所在屏幕', click: desktop.updateDisplay },
      {
        label: '停止当前动作',
        click: () => {
          void stop().catch((error) => log('stop-failed', String(error)));
        },
      },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ]),
  );
  tray.on('double-click', () => desktop.showPanel());
  app.on('second-instance', () => desktop.showPanel());
  app.on('activate', () => desktop.showPanel());
  app.on('before-quit', (event) => {
    if (quitting) return;
    event.preventDefault();
    quitting = true;
    void (async () => {
      try {
        await Promise.all([controller.close(), connection.close(), updater.close()]);
        await local.close();
      } catch (error) {
        log('shutdown-failed', String(error));
      } finally {
        tray.destroy();
        pet.destroy();
        panel.destroy();
        if (pendingInstaller) {
          try {
            await installUpdate(pendingInstaller, installation);
          } catch (error) {
            dialog.showErrorBox(
              '升级启动失败',
              error instanceof Error ? error.message : String(error),
            );
          }
        }
        app.quit();
      }
    })();
  });
  writeFileSync(
    join(data, 'connection.json'),
    JSON.stringify({ url: local.url, token: apiToken }),
    { mode: 0o600 },
  );
  log('ready', local.url);
  if (existsSync(join(data, 'settings.json')))
    void connection.control('connect').catch((error) => log('connect-failed', String(error)));
  app.once('will-quit', () => log('quit'));
  if (process.env.EMBODIED_TEST) console.log(`EMBODIED_READY ${local.url}`);
}
