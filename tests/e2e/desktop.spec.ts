import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtemp, readFile, writeFile, copyFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { PROTOCOL } from '../../src/protocol/schema';
import type { ConnectionOverview } from '../../src/integrations/anelf/contracts';
import type { ModelCapabilities } from '../../src/protocol/model';
import type { HitRegion } from '../../src/shared/hit-region';
import { regionBounds } from '../../src/shared/hit-region';

const require = createRequire(import.meta.url);
let app: ElectronApplication, panel: Page, pet: Page;
let connection: { url: string; token: string };
let data: string;
const errors: string[] = [];

interface PointerProbe {
  x: number;
  y: number;
  ignored?: boolean;
  captured?: boolean;
  regions: HitRegion[];
}
async function probePointer() {
  await app.evaluate(({ BrowserWindow, screen, ipcMain }) => {
    const window = BrowserWindow.getAllWindows().find((item) =>
      item.webContents.getURL().includes('view=pet'),
    )!;
    const contents = window.webContents;
    const probe: PointerProbe = { x: 0, y: 0, regions: [] };
    (globalThis as unknown as { pointerProbe: PointerProbe }).pointerProbe = probe;
    screen.getCursorScreenPoint = () => ({
      x: probe.x + window.getBounds().x,
      y: probe.y + window.getBounds().y,
    });
    const original = window.setIgnoreMouseEvents.bind(window);
    window.setIgnoreMouseEvents = (ignored, options) => {
      probe.ignored = ignored;
      original(ignored, options);
    };
    ipcMain.on('pet:regions', (event, regions: HitRegion[]) => {
      if (event.sender === contents) probe.regions = regions;
    });
    ipcMain.on('pet:capture', (event, captured: boolean) => {
      if (event.sender === contents) probe.captured = captured;
    });
  });
  await expect
    .poll(() =>
      app.evaluate(() =>
        (globalThis as unknown as { pointerProbe: PointerProbe }).pointerProbe.regions.some(
          (item) => item.kind === 'model',
        ),
      ),
    )
    .toBe(true);
}
async function expectPointerAt(x: number, y: number, ignored: boolean) {
  await app.evaluate(
    (_electron, point) => {
      Object.assign((globalThis as unknown as { pointerProbe: PointerProbe }).pointerProbe, point);
    },
    { x, y },
  );
  await expect
    .poll(() =>
      app.evaluate(
        () => (globalThis as unknown as { pointerProbe: PointerProbe }).pointerProbe.ignored,
      ),
    )
    .toBe(ignored);
}
async function expectCaptured(captured: boolean) {
  await expect
    .poll(() =>
      app.evaluate(
        () => (globalThis as unknown as { pointerProbe: PointerProbe }).pointerProbe.captured,
      ),
    )
    .toBe(captured);
}

async function visiblePetBounds() {
  const region = await app.evaluate(() =>
    (globalThis as unknown as { pointerProbe: PointerProbe }).pointerProbe.regions.find(
      (item) => item.kind === 'model',
    ),
  );
  return region && regionBounds(region);
}

async function steadyModel() {
  await pet.emulateMedia({ reducedMotion: 'reduce' });
  await pet.addStyleTag({
    content:
      '.skin-look, .skin-frame { transform: none !important; rotate: none !important; scale: none !important; animation: none !important; }',
  });
}

test('transparent model pixels pass through without clicks, chat or drag takeover', async () => {
  await probePointer();
  const body = pet.locator('.pet-body');
  const box = (await body.boundingBox())!;
  const start = await pet.locator('.pet-anchor').getAttribute('style');
  await expectPointerAt(box.x + box.width / 2, box.y + box.height / 2, false);
  await expectPointerAt(box.x + 2, box.y + 2, true);
  await body.click({ position: { x: 2, y: 2 }, force: true });
  await pet.waitForTimeout(350);
  await expect(pet.locator('.pet-wheel')).not.toBeVisible();
  await body.dblclick({ position: { x: 2, y: 2 }, force: true });
  await expect(pet.getByRole('textbox', { name: '发送消息' })).not.toBeVisible();
  await body.click({ button: 'right', position: { x: 2, y: 2 }, force: true });
  await expect(pet.locator('.pet-wheel')).not.toBeVisible();
  await pet.mouse.move(box.x + 2, box.y + 2);
  await pet.mouse.down();
  await pet.mouse.move(box.x - 80, box.y - 80, { steps: 8 });
  await pet.mouse.up();
  await expect(body).not.toHaveClass(/pressed/);
  await expect(pet.locator('.pet-anchor')).toHaveAttribute('style', start!);
  await expect(pet.locator('.pet-anchor')).not.toHaveAttribute('data-behavior', 'touch');
  await body.click({ force: true });
  await expect(pet.locator('.pet-wheel')).toBeVisible();
  const wheel = (await pet.locator('.pet-wheel').boundingBox())!;
  await expectPointerAt(wheel.x + wheel.width / 2, wheel.y + wheel.height / 2, false);
  await pet.getByRole('button', { name: '收起轮盘' }).click();
});

test('PNG hit masks follow sprite frames and exclude aspect-ratio padding', async () => {
  const source = await mkdtemp(join(tmpdir(), 'embodied-alpha-'));
  const image = await pet.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 100;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#4466cc';
    context.fillRect(8, 20, 24, 60);
    context.fillRect(128, 20, 24, 60);
    return canvas.toDataURL().split(',')[1]!;
  });
  await writeFile(join(source, 'sprite.png'), Buffer.from(image, 'base64'));
  await writeFile(
    join(source, 'manifest.json'),
    JSON.stringify({
      version: 2,
      id: 'alpha-frames',
      name: '透明帧测试',
      type: 'png',
      model: { animations: { idle: { file: 'sprite.png', columns: 2, frames: 2, fps: 2 } } },
      bindings: { idle: 'idle' },
    }),
  );
  await app.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
  }, source);
  await openSettings();
  await panel.getByRole('button', { name: '更换形象', exact: true }).click();
  await panel.locator('.skin-chooser > summary').click();
  await panel.getByRole('button', { name: '导入皮肤文件夹' }).click();
  await expect(pet.locator('.model-view')).toHaveAttribute('data-model-status', 'ready');
  await probePointer();
  const samples = () =>
    app.evaluate(() => {
      const region = (
        globalThis as unknown as { pointerProbe: PointerProbe }
      ).pointerProbe.regions.find((item) => item.kind === 'model');
      if (region?.kind !== 'model') return [];
      const { mask } = region;
      return [0.03, 0.3, 0.7, 0.97].map((x) => {
        const index = Math.floor(mask.height / 2) * mask.width + Math.floor(mask.width * x);
        return !!(mask.bits[index >> 3]! & (1 << (index & 7)));
      });
    });
  await expect.poll(samples, { intervals: [60] }).toEqual([false, true, false, false]);
  await expect.poll(samples, { intervals: [60] }).toEqual([false, false, true, false]);
  await expect.poll(samples, { intervals: [60] }).toEqual([false, true, false, false]);
  await panel.getByRole('button', { name: '设为 500%' }).click();
  await expect.poll(samples, { intervals: [60] }).toEqual([false, false, true, false]);
  expect((await (await request('/v1/capabilities')).json()).model.status).toBe('ready');
});

test('invalid Live2D keeps failure and retry visible without announcing readiness', async () => {
  const source = await mkdtemp(join(tmpdir(), 'embodied-invalid-model-'));
  await copyFile('src/renderer/public/skins/anelf/idle.png', join(source, 'pet.png'));
  await writeFile(join(source, 'pet.moc3'), 'invalid-model');
  await writeFile(
    join(source, 'pet.model3.json'),
    JSON.stringify({ Version: 3, FileReferences: { Moc: 'pet.moc3', Textures: ['pet.png'] } }),
  );
  await app.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
  }, source);
  await openSettings();
  await panel.getByRole('button', { name: '更换形象', exact: true }).click();
  await panel.locator('.skin-chooser > summary').click();
  await panel.getByRole('button', { name: '导入皮肤文件夹' }).click();
  await expect(panel.getByRole('button', { name: '重新加载' })).toBeVisible();
  const before = (await (await request('/v1/capabilities')).json()).model;
  expect(before.status).toBe('error');
  await panel.getByRole('button', { name: '重新加载' }).click();
  await expect
    .poll(async () => (await (await request('/v1/capabilities')).json()).model)
    .toMatchObject({ status: 'error' });
  const after = (await (await request('/v1/capabilities')).json()).model;
  expect(after.revision).not.toBe(before.revision);
  await panel.getByText('查看原因', { exact: true }).click();
  await panel.screenshot({ path: 'test-results/model-load-error.png' });
  await panel.getByRole('button', { name: 'Anelf · 银蓝猫耳 内置' }).click();
  await expect(pet.getByAltText('Anelf · 银蓝猫耳')).toBeVisible();
});

test('padded PNG characters reach visible edges and skin changes discard old bounds', async () => {
  await steadyModel();
  const install = async (id: string, padded: boolean) => {
    const source = await mkdtemp(join(tmpdir(), 'embodied-visible-edge-'));
    const image = await pet.evaluate((padding) => {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = 256;
      const context = canvas.getContext('2d')!;
      context.fillStyle = '#4466cc';
      if (padding) context.fillRect(96, 16, 64, 224);
      else context.fillRect(0, 0, 256, 256);
      return canvas.toDataURL().split(',')[1]!;
    }, padded);
    await writeFile(join(source, 'pet.png'), Buffer.from(image, 'base64'));
    await writeFile(
      join(source, 'manifest.json'),
      JSON.stringify({
        version: 2,
        id,
        name: id,
        type: 'png',
        model: { animations: { idle: { file: 'pet.png', frames: 1, columns: 1, fps: 1 } } },
        bindings: { idle: 'idle' },
      }),
    );
    await app.evaluate(({ dialog }, directory) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
    }, source);
    await panel.evaluate(() => window.embodied.importSkin());
    await expect(pet.locator('.model-view')).toHaveAttribute('data-model-status', 'ready');
    await expect(pet.getByAltText(id)).toBeVisible();
  };
  await install('narrow-edge', true);
  await panel.evaluate(() => window.embodied.setAppearance({ skinId: 'narrow-edge', scale: 3 }));
  await probePointer();
  const viewport = await pet.evaluate(() => ({ width: innerWidth, height: innerHeight }));
  for (const [x, y] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]) {
    const id = `visible-${x}-${y}`;
    await request(
      '/v1/commands',
      command(id, [
        { action: 'move', x, y, durationMs: 100 },
        { action: 'say', text: id, durationMs: 30000 },
      ]),
    );
    await expect(pet.getByText(id, { exact: true })).toBeVisible();
    await expect
      .poll(async () => {
        const r = await visiblePetBounds();
        return (
          !!r &&
          Math.abs(x ? r.x + r.width - viewport.width : r.x) < 1 &&
          Math.abs(y ? r.y + r.height - viewport.height : r.y) < 1
        );
      })
      .toBe(true);
    expect(
      await pet.locator('.pet-body').evaluate(
        (element, target) => {
          const r = element.getBoundingClientRect();
          return target.x ? r.right > innerWidth + 100 : r.left < -100;
        },
        { x, y },
      ),
    ).toBe(true);
    expect(
      await pet.locator('.pet-bubble').evaluate((element) => {
        const r = element.getBoundingClientRect();
        return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
      }),
    ).toBe(true);
    await request('/v1/cancel', { id });
  }
  await install('wide-edge', false);
  await expect
    .poll(async () => {
      const r = await visiblePetBounds();
      return (
        !!r &&
        r.x >= -1 &&
        r.y >= -1 &&
        r.x + r.width <= viewport.width + 1 &&
        r.y + r.height <= viewport.height + 1
      );
    })
    .toBe(true);
});

test('Live2D discovers actions, renders real Cubism, cancels and fences skin changes through MCP', async () => {
  test.skip(
    !process.env.EMBODIED_LIVE2D_FIXTURE,
    'Set EMBODIED_LIVE2D_FIXTURE to an official runtime model folder',
  );
  test.setTimeout(90000);
  await app.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
  }, process.env.EMBODIED_LIVE2D_FIXTURE!);
  await openSettings();
  await panel.getByRole('button', { name: '更换形象', exact: true }).click();
  await panel.locator('.skin-chooser > summary').click();
  await panel.getByRole('button', { name: '导入皮肤文件夹' }).click();
  await expect
    .poll(async () => (await (await request('/v1/capabilities')).json()).model, { timeout: 25000 })
    .toMatchObject({ type: 'live2d', status: 'ready' });
  await expect(pet.locator('canvas.live2d-canvas')).toBeVisible();
  const initialRevision = (await (await request('/v1/capabilities')).json()).model.revision;
  await panel.getByRole('button', { name: '设为 500%' }).click();
  await expect(panel.getByRole('spinbutton', { name: '桌宠大小百分比' })).toHaveValue('500');
  await expect
    .poll(() =>
      pet.locator('canvas').evaluate((element) => {
        const canvas = element as HTMLCanvasElement;
        return (
          canvas.width ===
          Math.min(
            2048,
            Math.max(256, Math.ceil((canvas.clientWidth * devicePixelRatio) / 64) * 64),
          )
        );
      }),
    )
    .toBe(true);
  expect((await (await request('/v1/capabilities')).json()).model.revision).toBe(initialRevision);
  await probePointer();
  const silhouette = await app.evaluate(() => {
    const region = (
      globalThis as unknown as { pointerProbe: PointerProbe }
    ).pointerProbe.regions.find((item) => item.kind === 'model');
    if (region?.kind !== 'model') throw new Error('Missing Live2D hit mask');
    const { mask, origin, horizontal, vertical } = region;
    const at = (x: number, y: number) => {
      const i = y * mask.width + x;
      return !!(mask.bits[i >> 3]! & (1 << (i & 7)));
    };
    const candidates: { x: number; y: number; distance: number }[] = [];
    for (let y = 6; y < mask.height - 6; y += 2) {
      for (let x = 6; x < mask.width - 6; x += 2) {
        if (at(x, y) && at(x - 5, y) && at(x + 5, y) && at(x, y - 5) && at(x, y + 5))
          candidates.push({
            x: (x + 0.5) / mask.width,
            y: (y + 0.5) / mask.height,
            distance: Math.hypot(x - mask.width / 2, y - mask.height / 2),
          });
      }
    }
    const hit = candidates.sort((a, b) => a.distance - b.distance)[0];
    if (!hit) throw new Error('Rendered Live2D has no opaque hit area');
    return {
      hit: {
        x: origin.x + horizontal.x * hit.x + vertical.x * hit.y,
        y: origin.y + horizontal.y * hit.x + vertical.y * hit.y,
      },
      miss: {
        x: origin.x + horizontal.x * 0.01 + vertical.x * 0.01,
        y: origin.y + horizontal.y * 0.01 + vertical.y * 0.01,
      },
    };
  });
  await expectPointerAt(silhouette.hit.x, silhouette.hit.y, false);
  await expectPointerAt(silhouette.miss.x, silhouette.miss.y, true);
  await panel.screenshot({ path: 'test-results/appearance-large-model.png' });

  await pet.screenshot({ path: 'test-results/live2d-initial.png' });
  const pixels = await pet.locator('canvas').evaluate(
    (element) =>
      new Promise<number>((resolve) =>
        requestAnimationFrame(() => {
          const canvas = element as HTMLCanvasElement;
          const copy = document.createElement('canvas');
          copy.width = canvas.width;
          copy.height = canvas.height;
          const context = copy.getContext('2d')!;
          context.drawImage(canvas, 0, 0);
          resolve(
            [...context.getImageData(0, 0, copy.width, copy.height).data].filter(
              (value, index) => index % 4 === 3 && value > 0,
            ).length,
          );
        }),
      ),
  );
  expect(pixels).toBeGreaterThan(1000);
  await steadyModel();
  for (const edge of [0, 1]) {
    const id = `live2d-edge-${edge}`;
    await request(
      '/v1/commands',
      command(id, [{ action: 'move', x: edge, y: edge, durationMs: 100 }]),
    );
    await expect
      .poll(async () => (await (await request(`/v1/receipts/${id}`)).json()).status)
      .toBe('completed');
    const viewport = await pet.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    await expect
      .poll(async () => {
        const bounds = await visiblePetBounds();
        if (!bounds) return false;
        // Live2D breath and physics continue between opacity samples.
        return edge
          ? Math.abs(bounds.x + bounds.width - viewport.width) < 24 &&
              Math.abs(bounds.y + bounds.height - viewport.height) < 24
          : Math.abs(bounds.x) < 24 && Math.abs(bounds.y) < 24;
      })
      .toBe(true);
    expect(
      await pet.locator('canvas').evaluate((element, end) => {
        const rect = element.getBoundingClientRect();
        return end ? rect.right > innerWidth : rect.left < 0;
      }, edge),
    ).toBe(true);
  }
  await pet.screenshot({ path: 'test-results/live2d-visible-edge.png' });
  const client = await connectMcp();
  try {
    const capabilities = (await client.callTool({ name: 'pet_capabilities' }))
      .structuredContent as unknown as { model: ModelCapabilities };
    const model = capabilities.model;
    expect(model.actions.length).toBeGreaterThan(1);
    const motion = model.actions.find(
      (action) => action.kind === 'motion' && action.name !== model.bindings.idle,
    )!;
    expect(motion).toBeDefined();
    const action = {
      action: 'perform',
      name: motion.name,
      revision: model.revision,
      durationMs: 1800,
    };
    const batch = command('live2d-play', [action]);
    const pending = client.callTool({ name: 'pet_execute', arguments: batch });
    await expect(pet.locator('canvas')).toHaveAttribute('data-action', motion.name);
    await panel.evaluate(
      ({ skinId, name }) => window.embodied.setBehaviors({ skinId, patch: { touch: name } }),
      { skinId: model.skinId, name: motion.name },
    );
    const updatedModel = (await (await request('/v1/capabilities')).json()).model;
    expect(updatedModel.bindings.touch).toBe(motion.name);
    expect(updatedModel.revision).toBe(model.revision);
    expect(updatedModel.status).toBe('ready');
    await panel.getByRole('button', { name: '设为 300%' }).click();
    await expect(panel.getByRole('spinbutton', { name: '桌宠大小百分比' })).toHaveValue('300');
    expect((await (await request('/v1/capabilities')).json()).model.revision).toBe(model.revision);
    await expect(pet.locator('canvas')).toHaveAttribute('data-action', motion.name);
    await pet.screenshot({ path: 'test-results/live2d-pet.png' });
    await panel.screenshot({ path: 'test-results/live2d-panel.png' });
    expect((await pending).structuredContent).toMatchObject({ status: 'completed', completed: 1 });
    const duplicate = await client.callTool({ name: 'pet_execute', arguments: batch });
    expect(duplicate.structuredContent).toMatchObject({ status: 'completed', completed: 1 });
    const expression = model.actions.find((action) => action.kind === 'expression');
    if (expression) {
      const result = await client.callTool({
        name: 'pet_execute',
        arguments: command('live2d-expression', [
          { ...action, name: expression.name, durationMs: 300 },
        ]),
      });
      expect(result.structuredContent).toMatchObject({ status: 'completed', completed: 1 });
    }
    await request('/v1/commands', command('live2d-cancel', [{ ...action, durationMs: 10000 }]));
    await expect(pet.locator('canvas')).toHaveAttribute('data-action', motion.name);
    const cancelled = await client.callTool({
      name: 'pet_cancel',
      arguments: { id: 'live2d-cancel' },
    });
    expect(cancelled.structuredContent).toMatchObject({
      receipts: [{ status: 'cancelled', completed: 0 }],
    });
    await expect(pet.locator('canvas')).toHaveAttribute('data-action', model.bindings.idle!);
    const abort = new AbortController();
    const sdkCall = client
      .callTool(
        {
          name: 'pet_execute',
          arguments: command('live2d-sdk-cancel', [
            { action: 'say', text: '准备动作', durationMs: 300 },
            { ...action, durationMs: 10000 },
          ]),
        },
        undefined,
        { signal: abort.signal },
      )
      .catch(() => undefined);
    await expect(pet.locator('canvas')).toHaveAttribute('data-action', motion.name);
    abort.abort();
    await sdkCall;
    await expect
      .poll(async () => await (await request('/v1/receipts/live2d-sdk-cancel')).json())
      .toMatchObject({ status: 'cancelled', completed: 1 });
    await expect(pet.locator('canvas')).toHaveAttribute('data-action', model.bindings.idle!);
    await request('/v1/commands', command('live2d-switch', [{ ...action, durationMs: 10000 }]));
    await expect(pet.locator('canvas')).toHaveAttribute('data-action', motion.name);
    await panel.getByRole('button', { name: 'Anelf · 银蓝猫耳 内置' }).click();
    await expect(pet.getByAltText('Anelf · 银蓝猫耳')).toBeVisible();
    await expect
      .poll(async () => (await (await request('/v1/receipts/live2d-switch')).json()).status)
      .toBe('cancelled');
    const stale = await request('/v1/commands', command('live2d-stale', [action]));
    expect(stale.status).toBe(409);
  } finally {
    await client.close();
  }
});
test('ViewerEX library uses WPK in memory, keeps voice cancellation and deduplicates Steam entries', async () => {
  test.skip(!process.env.EMBODIED_WPK_FIXTURE, 'Set EMBODIED_WPK_FIXTURE to a local ViewerEX WPK');
  test.setTimeout(90000);
  await openSettings();
  await panel.getByRole('button', { name: '更换形象', exact: true }).click();
  await panel.locator('.skin-chooser > summary').click();
  await panel.locator('.model-library > summary').click();
  await expect(panel.getByRole('button', { name: '添加模型文件' })).toBeEnabled({ timeout: 20000 });
  const discovered = await panel.evaluate(() => window.embodied.modelLibrary({ action: 'list' }));
  for (const root of discovered.roots)
    await panel.evaluate(
      (root) => window.embodied.modelLibrary({ action: 'remove', ...root }),
      root,
    );
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, process.env.EMBODIED_WPK_FIXTURE!);
  await panel.getByRole('button', { name: '添加模型文件' }).click();
  await expect(panel.getByRole('button', { name: '添加模型文件' })).toBeEnabled();
  const state = await panel.evaluate(() => window.embodied.modelLibrary({ action: 'list' }));
  const entry = state.models.find((model) => model.name.includes('丛雨'))!;
  expect(entry).toBeDefined();
  expect(entry.format).toBe('WPK');
  expect(state.models.filter((item) => item.id === entry.id)).toHaveLength(1);
  await panel.getByLabel('搜索模型库').fill('丛雨');
  await panel.locator('.library-model').getByRole('button', { name: '使用', exact: true }).click();
  await expect
    .poll(async () => (await (await request('/v1/capabilities')).json()).model, { timeout: 25000 })
    .toMatchObject({ type: 'live2d', status: 'ready' });
  const model = (await (await request('/v1/capabilities')).json()).model as ModelCapabilities;
  expect(model.actions).toHaveLength(19);
  expect(await readdir(join(data, 'skins', model.skinId))).toEqual(['source.json']);
  await panel.screenshot({ path: 'test-results/viewerex-library.png' });
  await pet.screenshot({ path: 'test-results/viewerex-pet.png' });
  await pet.evaluate(() => {
    const original = AudioContext.prototype.createBufferSource;
    const active = new Set<AudioBufferSourceNode>();
    Object.assign(window, { voiceNodes: active });
    AudioContext.prototype.createBufferSource = function () {
      const node = original.call(this),
        start = node.start.bind(node),
        stop = node.stop.bind(node);
      node.start = (...args) => {
        active.add(node);
        return start(...args);
      };
      node.stop = (...args) => {
        active.delete(node);
        return stop(...args);
      };
      node.addEventListener('ended', () => active.delete(node));
      return node;
    };
  });
  const client = await connectMcp();
  const action = {
    action: 'perform',
    name: 'motion/Tapface/0',
    revision: model.revision,
    durationMs: 10000,
  };
  try {
    await request('/v1/commands', command('viewerex-voice', [action]));
    await expect
      .poll(() =>
        pet.evaluate(() => (window as unknown as { voiceNodes: Set<unknown> }).voiceNodes.size),
      )
      .toBe(1);
    const cancelled = await client.callTool({
      name: 'pet_cancel',
      arguments: { id: 'viewerex-voice' },
    });
    expect(cancelled.structuredContent).toMatchObject({ receipts: [{ status: 'cancelled' }] });
    await expect
      .poll(() =>
        pet.evaluate(() => (window as unknown as { voiceNodes: Set<unknown> }).voiceNodes.size),
      )
      .toBe(0);
    const result = await client.callTool({
      name: 'pet_execute',
      arguments: command('viewerex-complete', [{ ...action, durationMs: 300 }]),
    });
    expect(result.structuredContent).toMatchObject({ status: 'completed', completed: 1 });
    await expect
      .poll(() =>
        pet.evaluate(() => (window as unknown as { voiceNodes: Set<unknown> }).voiceNodes.size),
      )
      .toBe(0);
    await panel.evaluate((id) => window.embodied.modelLibrary({ action: 'use', id }), entry.id);
    const after = await panel.evaluate(() => window.embodied.snapshot());
    expect(after.appearance.skins.filter((skin) => skin.id === model.skinId)).toHaveLength(1);
    await expect
      .poll(async () => (await (await request('/v1/capabilities')).json()).model.status)
      .toBe('ready');
    expect(after.model?.revision).not.toBe(model.revision);
    await request(
      '/v1/commands',
      command('viewerex-switch', [{ ...action, revision: after.model!.revision }]),
    );
    await expect
      .poll(() =>
        pet.evaluate(() => (window as unknown as { voiceNodes: Set<unknown> }).voiceNodes.size),
      )
      .toBe(1);
    await panel.getByRole('button', { name: 'Anelf · 银蓝猫耳 内置' }).click();
    await expect
      .poll(() =>
        pet.evaluate(() => (window as unknown as { voiceNodes: Set<unknown> }).voiceNodes.size),
      )
      .toBe(0);
    await expect
      .poll(async () => (await (await request('/v1/receipts/viewerex-switch')).json()).status)
      .toBe('cancelled');
  } finally {
    await client.close();
  }
});

test('ViewerEX installed library renders every supported local model and switches safely', async () => {
  test.skip(
    !process.env.EMBODIED_VIEWEREX_FIXTURE,
    'Set EMBODIED_VIEWEREX_FIXTURE to a local model library',
  );
  test.setTimeout(120000);
  await openSettings();
  await panel.getByRole('button', { name: '更换形象', exact: true }).click();
  await panel.locator('.skin-chooser > summary').click();
  await panel.locator('.model-library > summary').click();
  await expect(panel.getByRole('button', { name: '添加目录' })).toBeEnabled({ timeout: 20000 });
  await app.evaluate(({ dialog }, path) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] });
  }, process.env.EMBODIED_VIEWEREX_FIXTURE!);
  await panel.getByRole('button', { name: '添加目录' }).click();
  await expect(panel.getByRole('button', { name: '添加目录' })).toBeEnabled();
  const library = await panel.evaluate(() => window.embodied.modelLibrary({ action: 'list' }));
  expect(library.models.length).toBeGreaterThan(1);
  for (const item of library.models.filter((item) => !item.detail)) {
    await panel.evaluate((id) => window.embodied.modelLibrary({ action: 'use', id }), item.id);
    await expect
      .poll(async () => (await (await request('/v1/capabilities')).json()).model, {
        timeout: 25000,
        message: item.name,
      })
      .toMatchObject({ type: 'live2d', status: 'ready' });
    await pet.screenshot({
      path: `test-results/viewerex-${item.id}.png`,
      clip: (await pet.locator('canvas').boundingBox())!,
    });
    const model = (await (await request('/v1/capabilities')).json()).model as ModelCapabilities;
    const action = model.actions.find((action) => action.name !== model.bindings.idle);
    if (action) {
      await request(
        '/v1/commands',
        command(`model-${item.id}`, [
          { action: 'perform', name: action.name, revision: model.revision, durationMs: 200 },
        ]),
      );
      await expect
        .poll(async () => (await (await request(`/v1/receipts/model-${item.id}`)).json()).status)
        .toBe('completed');
    }
  }
});

test.beforeEach(async () => {
  data = await mkdtemp(join(tmpdir(), 'embodied-e2e-'));
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    EMBODIED_DATA_DIR: data,
    EMBODIED_PORT: '0',
    EMBODIED_TEST: '1',
  };
  delete env.ELECTRON_RUN_AS_NODE;
  const launchEnv = Object.fromEntries(
    Object.entries(env).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
  app = await electron.launch({
    executablePath: process.env.EMBODIED_EXECUTABLE ?? (require('electron') as string),
    args: process.env.EMBODIED_EXECUTABLE ? [] : ['.', ...(process.env.CI ? ['--no-sandbox'] : [])],
    env: launchEnv,
  });
  await expect.poll(() => app.windows().length).toBe(2);
  panel = app.windows().find((page) => !page.url().includes('view=pet'))!;
  pet = app.windows().find((page) => page.url().includes('view=pet'))!;
  expect(
    await app.evaluate(({ BrowserWindow, Menu }) => ({
      visible: BrowserWindow.getAllWindows()
        .find((window) => !window.webContents.getURL().includes('view=pet'))
        ?.isVisible(),
      menu: Menu.getApplicationMenu(),
    })),
  ).toEqual({ visible: false, menu: null });
  await expect(pet.getByAltText('Anelf · 银蓝猫耳')).toBeVisible();
  await expect(async () => {
    connection = JSON.parse(
      await readFile(join(data, 'connection.json'), 'utf8'),
    ) as typeof connection;
  }).toPass({ timeout: 8000 });
  errors.length = 0;
  for (const page of [panel, pet]) page.on('pageerror', (error) => errors.push(error.message));
});
test.afterEach(async () => {
  await app?.close();
  const log = await readFile(join(data, 'logs/runtime.log'), 'utf8');
  expect(log).not.toMatch(/uncaught-error|shutdown-failed/);
  const receipts = await readFile(join(data, 'receipts.json'), 'utf8').catch(() => '');
  expect(receipts).not.toContain('did not acknowledge cancellation');
  expect(errors).toEqual([]);
});
const request = (path: string, body?: object) =>
  fetch(`${connection.url}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: {
      Authorization: `Bearer ${connection.token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
const command = (id: string, commands: object[]) => ({
  protocol: PROTOCOL,
  id,
  session: 'e2e',
  expiresAt: Date.now() + 120000,
  commands,
});

const openSettings = async () => {
  if (!(await pet.getByRole('menu', { name: '桌宠操作轮盘' }).isVisible()))
    await pet.locator('.pet-body').click({ force: true });
  await pet.getByRole('menuitem', { name: '连接设置', exact: true }).click();
  await expect(panel.getByLabel('频道地址')).toBeVisible();
};

test('single click opens a wheel and double-click opens only a compact input bubble', async () => {
  await pet.locator('.pet-body').click({ force: true });
  await expect(pet.getByRole('menu', { name: '桌宠操作轮盘' })).toBeVisible();
  await expect(pet.locator('.pet-anchor')).toHaveAttribute('data-behavior', 'touch');
  await pet.screenshot({ path: 'test-results/pet-wheel.png' });
  await pet.getByRole('button', { name: '收起轮盘' }).click();
  await pet.locator('.pet-body').dblclick({ force: true });
  const input = pet.getByRole('textbox', { name: '发送消息' });
  await expect(input).toBeVisible();
  const bubble = await pet.locator('.pet-bubble').boundingBox();
  expect(bubble!.height).toBeLessThan(180);
  expect(bubble!.width).toBeLessThanOrEqual(280);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => !window.webContents.getURL().includes('view=pet'))!
        .isVisible(),
    ),
  ).toBe(false);
  await input.fill('未发送的想法');
  await pet.screenshot({ path: 'test-results/pet-input.png' });
  await pet.keyboard.press('Escape');
  await expect(input).toHaveCount(0);
  await pet.locator('.pet-body').dblclick({ force: true });
  await expect(input).toHaveValue('未发送的想法');
  await openSettings();
  await panel.screenshot({ path: 'test-results/desktop-panel.png' });
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((window) => !window.webContents.getURL().includes('view=pet'))
      ?.setSize(360, 540);
  });
  await expect
    .poll(() => panel.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await panel.screenshot({ path: 'test-results/compact-panel.png', fullPage: true });
});

test('HTTP drives real bubbles and returns partial cancellation receipts', async () => {
  const input = command('partial', [
    { action: 'emote', name: 'happy', durationMs: 100 },
    { action: 'say', text: '我是一只独立运行的桌面伙伴。', durationMs: 30000 },
  ]);
  expect((await request('/v1/commands', input)).status).toBe(202);
  await expect(pet.getByText('我是一只独立运行的桌面伙伴。')).toBeVisible();
  await pet.screenshot({ path: 'test-results/pet-overlay.png' });
  const result = await (await request('/v1/cancel', { id: 'partial' })).json();
  expect(result.receipts[0]).toMatchObject({ status: 'cancelled', completed: 1, total: 2 });
  await expect(pet.locator('.pet-bubble')).toHaveCount(0);
  const duplicate = await (await request('/v1/commands', input)).json();
  expect(duplicate.status).toBe('cancelled');
  await expect(pet.locator('.pet-bubble')).toHaveCount(0);
});

test('MCP question resolves from the real pet interface', async () => {
  const client = new Client({ name: 'desktop-e2e', version: '1' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL(`${connection.url}/mcp`), {
      requestInit: { headers: { Authorization: `Bearer ${connection.token}` } },
    }),
  );
  try {
    const pending = client.callTool({
      name: 'pet_execute',
      arguments: command('ask', [
        { action: 'ask', question: '现在继续吗？', options: ['继续', '稍后'], durationMs: 30000 },
      ]),
    });
    await pet.getByRole('button', { name: '继续', exact: true }).click();
    const result = await pending;
    expect(result.structuredContent).toMatchObject({
      status: 'completed',
      results: [{ outcome: 'completed', answer: '继续' }],
    });
    await expect(pet.locator('.pet-bubble')).toHaveCount(0);
  } finally {
    await client.close();
  }
});

test('renderer crash produces uncertainty and recovers for new work', async () => {
  await request(
    '/v1/commands',
    command('crash', [{ action: 'say', text: 'Crash recovery test', durationMs: 30000 }]),
  );
  await expect(pet.getByText('Crash recovery test')).toBeVisible();
  await app.evaluate(({ BrowserWindow }) => {
    BrowserWindow.getAllWindows()
      .find((window) => window.webContents.getURL().includes('view=pet'))
      ?.webContents.forcefullyCrashRenderer();
  });
  await expect
    .poll(async () => (await (await request('/v1/receipts/crash')).json()).status)
    .toBe('unknown');
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((window) => window.webContents.getURL().includes('view=pet'))
          ?.webContents.isCrashed(),
      ),
    )
    .toBe(false);
  await expect
    .poll(() =>
      app.evaluate(async ({ BrowserWindow }) => {
        const contents = BrowserWindow.getAllWindows().find((window) =>
          window.webContents.getURL().includes('view=pet'),
        )?.webContents;
        return contents
          ? contents.executeJavaScript('Boolean(document.querySelector(".pet-body"))')
          : false;
      }),
    )
    .toBe(true);
  await request(
    '/v1/commands',
    command('after-crash', [{ action: 'say', text: '恢复了', durationMs: 2000 }]),
  );
  await expect
    .poll(() =>
      app.evaluate(async ({ BrowserWindow }) => {
        const contents = BrowserWindow.getAllWindows().find((window) =>
          window.webContents.getURL().includes('view=pet'),
        )?.webContents;
        return contents
          ? contents.executeJavaScript('document.querySelector(".pet-bubble")?.textContent')
          : '';
      }),
    )
    .toContain('恢复了');
});

test('stdio MCP shares the running desktop instance', async () => {
  const client = new Client({ name: 'stdio-e2e', version: '1' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['dist/host/stdio.js'],
    env: { EMBODIED_URL: connection.url, EMBODIED_TOKEN: connection.token },
  });
  await client.connect(transport);
  try {
    const result = await client.callTool({
      name: 'pet_execute',
      arguments: command('stdio', [{ action: 'say', text: 'stdio 已接入', durationMs: 1000 }]),
    });
    expect(result.structuredContent).toMatchObject({ status: 'completed' });
    expect((await (await request('/v1/receipts/stdio')).json()).status).toBe('completed');
  } finally {
    await client.close();
  }
});

test('keeps questions within the screen at all movement boundaries', async () => {
  for (const [x, y] of [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ]) {
    await request(
      '/v1/commands',
      command(`edge-${x}-${y}`, [
        { action: 'move', x, y, durationMs: 100 },
        { action: 'ask', question: '边界验证'.repeat(100), options: ['继续'], durationMs: 30000 },
      ]),
    );
    await expect(pet.locator('.pet-bubble')).toBeVisible();
    expect(
      await pet.locator('.pet-bubble').evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight
        );
      }),
    ).toBe(true);
    await request('/v1/cancel', { id: `edge-${x}-${y}` });
    await expect(pet.locator('.pet-bubble')).toHaveCount(0);
  }
});

test('touch preserves AI work, dragging takes over, and the utility panel stays on screen', async () => {
  await probePointer();
  await request(
    '/v1/commands',
    command('drag-takeover', [{ action: 'say', text: '拖动接管验证', durationMs: 30000 }]),
  );
  await expect(pet.getByText('拖动接管验证')).toBeVisible();
  await pet.locator('.pet-body').click({ force: true });
  await expect(pet.locator('.pet-anchor')).toHaveAttribute('data-behavior', 'touch');
  expect((await (await request('/v1/receipts/drag-takeover')).json()).status).toBe('running');
  const box = await pet.locator('.pet-body').boundingBox();
  if (!box) throw new Error('Pet is not visible');
  await pet.mouse.move(box.x + 70, box.y + 70);
  await expectPointerAt(box.x + 70, box.y + 70, false);
  await pet.mouse.down();
  await expect(pet.locator('.pet-body')).toHaveClass(/pressed/);
  await expectCaptured(true);
  await pet.mouse.move(box.x - 90, box.y + 20, { steps: 10 });
  await pet.mouse.up();
  await expect(pet.locator('.pet-anchor')).toHaveAttribute('data-behavior', 'drop');
  await expect
    .poll(async () => (await (await request('/v1/receipts/drag-takeover')).json()).status)
    .toBe('cancelled');
  await openSettings();
  expect(
    await app.evaluate(({ BrowserWindow, screen }) => {
      const bounds = BrowserWindow.getAllWindows()
        .find((window) => !window.webContents.getURL().includes('view=pet'))!
        .getBounds();
      const area = screen.getDisplayMatching(bounds).workArea;
      return (
        bounds.x >= area.x &&
        bounds.y >= area.y &&
        bounds.x + bounds.width <= area.x + area.width &&
        bounds.y + bounds.height <= area.y + area.height
      );
    }),
  ).toBe(true);
  await panel.keyboard.press('Escape');
  await expect
    .poll(() =>
      app.evaluate(({ BrowserWindow }) =>
        BrowserWindow.getAllWindows()
          .find((window) => !window.webContents.getURL().includes('view=pet'))
          ?.isVisible(),
      ),
    )
    .toBe(false);
});

test('native dragging switches work areas, reaches corners and keeps capture until release', async () => {
  await steadyModel();
  await probePointer();
  await pet.evaluate(() => {
    const trace: string[] = [];
    (window as unknown as { dragTrace: string[] }).dragTrace = trace;
    for (const type of ['blur', 'focus', 'pointercancel', 'lostpointercapture', 'pointerup'])
      window.addEventListener(type, (event) =>
        trace.push(`${type}:${'buttons' in event ? event.buttons : ''}`),
      );
  });
  const areas = await app.evaluate(({ BrowserWindow, screen }) => {
    const display = screen.getPrimaryDisplay();
    const area = display.workArea;
    const width = Math.floor(area.width * 0.45);
    const left = { ...area, width };
    const right = {
      x: area.x + width,
      y: area.y + 40,
      width: area.width - width,
      height: area.height - 40,
    };
    const state = globalThis as unknown as { dragCursor: { x: number; y: number } };
    state.dragCursor = { x: left.x + 100, y: left.y + 100 };
    screen.getCursorScreenPoint = () => state.dragCursor;
    screen.getDisplayNearestPoint = (point) => ({
      ...display,
      workArea: point.x >= right.x ? right : left,
    });
    const pet = BrowserWindow.getAllWindows().find((window) =>
      window.webContents.getURL().includes('view=pet'),
    )!;
    let pressed = false;
    // Keep native hover input separate from the simulated pressed mouse button.
    pet.webContents.on('before-mouse-event', (event, mouse) => {
      if (mouse.type === 'mouseDown' && mouse.button === 'left') pressed = true;
      if (
        pressed &&
        ['mouseMove', 'mouseEnter', 'mouseLeave'].includes(mouse.type) &&
        mouse.button !== 'left'
      )
        event.preventDefault();
      if (mouse.type === 'mouseUp') pressed = false;
    });
    pet.setBounds(left);
    pet.focus();
    return { left, right };
  });
  await expect.poll(() => pet.evaluate(() => innerWidth)).toBe(areas.left.width);
  await expect
    .poll(() =>
      pet.locator('.pet-anchor').evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return Math.abs(rect.left - (innerWidth - rect.width) * 0.78) < 1;
      }),
    )
    .toBe(true);
  const body = pet.locator('.pet-body');
  const box = (await body.boundingBox())!;
  const setCursor = (point: { x: number; y: number }) =>
    app.evaluate((_electron, cursor) => {
      (globalThis as unknown as { dragCursor: { x: number; y: number } }).dragCursor = cursor;
    }, point);
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await setCursor({ x: areas.left.x + start.x, y: areas.left.y + start.y });
  await expect
    .poll(() =>
      app.evaluate(
        () => (globalThis as unknown as { pointerProbe: PointerProbe }).pointerProbe.ignored,
      ),
    )
    .toBe(false);
  await pet.mouse.move(start.x, start.y);
  await pet.mouse.down();
  await expectCaptured(true);
  await pet.mouse.move(start.x + 10, start.y);
  await expect(pet.locator('.pet-anchor')).toHaveAttribute('data-behavior', 'drag');
  for (const [area, bottomRight] of [
    [areas.right, true],
    [areas.left, false],
  ] as const) {
    await setCursor({
      x: area.x + (bottomRight ? area.width - 1 : 1),
      y: area.y + (bottomRight ? area.height - 1 : 1),
    });
    await expect
      .poll(() =>
        app.evaluate(({ BrowserWindow }) =>
          BrowserWindow.getAllWindows()
            .find((window) => window.webContents.getURL().includes('view=pet'))!
            .getBounds(),
        ),
      )
      .toEqual(area);
    await expect
      .poll(() =>
        (async () => {
          const rect = await visiblePetBounds();
          return (
            !!rect &&
            (bottomRight
              ? Math.abs(rect.x + rect.width - area.width) < 1 &&
                Math.abs(rect.y + rect.height - area.height) < 1
              : Math.abs(rect.x) < 1 && Math.abs(rect.y) < 1)
          );
        })(),
      )
      .toBe(true);
    expect(
      await body.evaluate((element, end) => {
        const rect = element.getBoundingClientRect();
        return end
          ? rect.right > innerWidth && rect.bottom > innerHeight
          : rect.left < 0 && rect.top < 0;
      }, bottomRight),
    ).toBe(true);
    await expect(pet.locator('.pet-anchor'))
      .toHaveAttribute('data-behavior', 'drag')
      .catch(async (error) => {
        console.log(
          'Drag event trace:',
          await pet.evaluate(() => (window as unknown as { dragTrace: string[] }).dragTrace),
        );
        console.log(
          'Native focus:',
          await app.evaluate(({ BrowserWindow }) =>
            BrowserWindow.getAllWindows().map((window) => ({
              focus: window.isFocused(),
              bounds: window.getBounds(),
            })),
          ),
        );
        throw error;
      });
  }
  await pet.mouse.up();
  await expectCaptured(false);
  await expect(pet.locator('.pet-anchor')).toHaveAttribute('data-behavior', 'drop');
  await request(
    '/v1/commands',
    command('drag-edge-bubble', [{ action: 'say', text: '跨屏后气泡仍可见', durationMs: 2000 }]),
  );
  await expect(pet.getByText('跨屏后气泡仍可见')).toBeVisible();
  expect(
    await pet.locator('.pet-bubble').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return (
        rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight
      );
    }),
  ).toBe(true);
});

test('imports a sprite skin, changes scale and switches back without interrupting a task', async () => {
  const source = await mkdtemp(join(tmpdir(), 'embodied-skin-e2e-'));
  await copyFile('src/renderer/public/skins/anelf/idle.png', join(source, 'pet.png'));
  await writeFile(
    join(source, 'manifest.json'),
    JSON.stringify({
      version: 1,
      id: 'test-skin',
      name: '测试皮肤',
      animations: { idle: { file: 'pet.png', columns: 2, frames: 4, fps: 8 } },
    }),
  );
  await app.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
  }, source);
  await openSettings();
  await panel.getByRole('button', { name: '更换形象', exact: true }).click();
  await panel.locator('.skin-chooser > summary').click();
  await panel.getByRole('button', { name: '导入皮肤文件夹' }).click();
  await expect(pet.getByAltText('测试皮肤')).toBeVisible();
  await expect
    .poll(async () => (await (await request('/v1/capabilities')).json()).model.status)
    .toBe('ready');
  const model = (await (await request('/v1/capabilities')).json()).model;
  await request(
    '/v1/commands',
    command('png-perform', [
      { action: 'perform', name: 'idle', revision: model.revision, durationMs: 300 },
    ]),
  );
  await expect
    .poll(async () => (await (await request('/v1/receipts/png-perform')).json()).status)
    .toBe('completed');
  await expect
    .poll(() =>
      pet.locator('.sprite-sheet').evaluate((element) => getComputedStyle(element).transform),
    )
    .not.toBe('matrix(1, 0, 0, 1, 0, 0)');
  await request(
    '/v1/commands',
    command('skin-live', [{ action: 'say', text: '换装时继续说话', durationMs: 30000 }]),
  );
  await expect(pet.getByText('换装时继续说话')).toBeVisible();
  await panel.getByRole('spinbutton', { name: '桌宠大小百分比' }).fill('150');
  await panel.getByRole('spinbutton', { name: '桌宠大小百分比' }).press('Enter');
  await expect
    .poll(() => pet.locator('.pet-body').evaluate((element) => element.clientWidth))
    .toBe(210);
  await panel.getByRole('button', { name: '移除皮肤', exact: true }).click();
  await expect(pet.getByAltText('Anelf · 银蓝猫耳')).toBeVisible();
  expect((await (await request('/v1/receipts/skin-live')).json()).status).toBe('running');
  await request('/v1/cancel', { id: 'skin-live' });
  const saved = JSON.parse(await readFile(join(data, 'appearance.json'), 'utf8'));
  expect(saved).toEqual({ skinId: 'anelf', scale: 1.5 });
  await panel.screenshot({ path: 'test-results/appearance-panel.png' });
  await panel.getByRole('slider', { name: '桌宠大小' }).focus();
  await panel.keyboard.press('Home');
  await request(
    '/v1/commands',
    command('small-edge', [
      { action: 'move', x: 1, y: 1, durationMs: 100 },
      { action: 'emote', name: 'happy', durationMs: 10000 },
    ]),
  );
  await expect(pet.locator('.pet-anchor')).toHaveAttribute('data-behavior', 'happy');
  await pet.locator('.pet-body').click({ force: true });
  await expect(pet.locator('.pet-wheel')).toBeVisible();
  expect(
    await pet.locator('.pet-wheel').evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.right <= innerWidth && bounds.bottom <= innerHeight;
    }),
  ).toBe(true);
});

test('size controls allow precise large models and fit smaller screens without losing settings', async () => {
  await steadyModel();
  await probePointer();
  await openSettings();
  await panel.getByRole('button', { name: '更换形象', exact: true }).click();
  await panel.locator('.skin-chooser > summary').click();
  const boundsBefore = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((window) => !window.webContents.getURL().includes('view=pet'))!
      .getBounds(),
  );
  const input = panel.getByRole('spinbutton', { name: '桌宠大小百分比' });
  await input.fill('375');
  await input.press('Enter');
  await expect(panel.getByRole('slider', { name: '桌宠大小' })).toHaveValue('375');
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => !window.webContents.getURL().includes('view=pet'))!
        .getBounds(),
    ),
  ).toEqual(boundsBefore);
  await expect
    .poll(() => pet.locator('.pet-body').evaluate((element) => element.clientWidth))
    .toBeGreaterThan(210);
  await input.fill('0');
  await input.press('Enter');
  await expect(input).toHaveAttribute('aria-invalid', 'true');
  expect((await panel.evaluate(() => window.embodied.snapshot())).appearance.scale).toBe(3.75);
  await input.fill('1000');
  await input.press('Enter');
  await expect
    .poll(async () => (await panel.evaluate(() => window.embodied.snapshot())).appearance.scale)
    .toBe(10);
  expect(
    await app.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((window) => !window.webContents.getURL().includes('view=pet'))!
        .getBounds(),
    ),
  ).toEqual(boundsBefore);
  await app.evaluate(({ BrowserWindow }) => {
    const window = BrowserWindow.getAllWindows().find((window) =>
      window.webContents.getURL().includes('view=pet'),
    )!;
    window.setBounds({ width: 800, height: 600 });
  });
  await expect
    .poll(async () => (await panel.evaluate(() => window.embodied.snapshot())).petViewport)
    .toEqual({ width: 800, height: 600 });
  await expect(panel.getByText(/当前屏幕适配为/)).toBeVisible();
  const body = (await pet.locator('.pet-body').boundingBox())!;
  await pet.mouse.move(body.x + body.width / 2, body.y + body.height / 2);
  await pet.mouse.down();
  await pet.mouse.move(body.x + body.width / 2 - 80, body.y + body.height / 2 - 30, { steps: 6 });
  await pet.mouse.up();
  await expect
    .poll(async () => {
      const r = await visiblePetBounds();
      const size = await pet.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      return (
        !!r &&
        r.x >= -1 &&
        r.y >= -1 &&
        r.x + r.width <= size.width + 1 &&
        r.y + r.height <= size.height + 1
      );
    })
    .toBe(true);
  await request(
    '/v1/commands',
    command('large-edge', [
      { action: 'move', x: 1, y: 1, durationMs: 100 },
      { action: 'ask', question: '放大后仍可回答', options: ['确认'], durationMs: 30000 },
    ]),
  );
  await expect(pet.getByRole('button', { name: '确认', exact: true })).toBeVisible();
  const bounds = await pet.evaluate(() =>
    ['.pet-bubble'].map((selector) => {
      const r = document.querySelector(selector)!.getBoundingClientRect();
      return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight;
    }),
  );
  expect(bounds).toEqual([true]);
  await expect
    .poll(async () => {
      const r = await visiblePetBounds();
      const size = await pet.evaluate(() => ({ width: innerWidth, height: innerHeight }));
      return (
        !!r &&
        Math.abs(r.x + r.width - size.width) < 1 &&
        Math.abs(r.y + r.height - size.height) < 1
      );
    })
    .toBe(true);
  await pet.getByRole('button', { name: '确认', exact: true }).click();
  await expect
    .poll(async () => (await (await request('/v1/receipts/large-edge')).json()).status)
    .toBe('completed');
  expect(JSON.parse(await readFile(join(data, 'appearance.json'), 'utf8')).scale).toBe(10);
  await panel.getByRole('button', { name: '设为 300%' }).click();
  await expect(input).toHaveValue('300');
  await input.fill('300.1');
  await input.press('Enter');
  await expect(input).toHaveValue('300');
  await input.fill('0');
  await panel.getByRole('button', { name: '设为 300%' }).click();
  await expect(input).toHaveValue('300');
  await panel.locator('.detail-scroll').evaluate((element) => {
    element.scrollTop = 0;
  });
  await panel.screenshot({ path: 'test-results/appearance-size-controls.png' });
  await input.fill('25');
  await input.press('Enter');
  await request(
    '/v1/commands',
    command('minimum-edge', [{ action: 'move', x: 0, y: 0, durationMs: 100 }]),
  );
  await expect
    .poll(async () => (await (await request('/v1/receipts/minimum-edge')).json()).status)
    .toBe('completed');
  await pet.locator('.pet-body').click({ force: true });
  await expect(pet.locator('.pet-wheel')).toBeVisible();
  expect(
    await pet.locator('.pet-wheel').evaluate((element) => {
      const r = element.getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && r.top >= 0;
    }),
  ).toBe(true);
});

test('packaged update interface shows download progress and a verified install action', async () => {
  test.skip(!process.env.EMBODIED_EXECUTABLE, 'Application updates require a packaged app');
  const payload = 'verified UI fixture';
  await app.evaluate(
    (_electron, fixture) => {
      const original = globalThis.fetch;
      globalThis.fetch = async (input, init) => {
        const url = String(input);
        if (url.endsWith('/repos/1292917512/Anelfbodied/releases/latest'))
          return new Response(
            JSON.stringify({
              tag_name: 'v9.0.0',
              draft: false,
              prerelease: false,
              assets: [
                {
                  name: 'AnelfBodied-Setup-9.0.0-x64.exe',
                  browser_download_url:
                    'https://github.com/1292917512/Anelfbodied/releases/download/v9.0.0/AnelfBodied-Setup-9.0.0-x64.exe',
                  size: fixture.payload.length,
                  digest: `sha256:${fixture.digest}`,
                },
              ],
            }),
          );
        if (url.endsWith('AnelfBodied-Setup-9.0.0-x64.exe'))
          return new Response(
            new ReadableStream({
              start(controller) {
                const bytes = new TextEncoder().encode(fixture.payload);
                controller.enqueue(bytes.subarray(0, 4));
                setTimeout(() => {
                  controller.enqueue(bytes.subarray(4));
                  controller.close();
                }, 1200);
              },
            }),
          );
        return original(input, init);
      };
    },
    { payload, digest: createHash('sha256').update(payload).digest('hex') },
  );
  await openSettings();
  await panel.getByText('应用与更新', { exact: true }).click();
  await panel.getByRole('button', { name: '检查更新', exact: true }).click();
  await panel.getByRole('button', { name: '下载更新', exact: true }).click();
  await expect(panel.getByRole('progressbar', { name: '更新下载进度' })).toBeVisible();
  await expect(panel.getByRole('button', { name: '重启并升级', exact: true })).toBeEnabled();
  await panel.screenshot({ path: 'test-results/update-panel.png' });
});

for (const [index, scheme] of ['HTTP', 'HTTPS'].entries()) {
  test(`real Anelf ${scheme} translates skills, controls through MCP and replies with speech`, async () => {
    test.skip(
      !process.env.ANELF_FIXTURE,
      'Set ANELF_FIXTURE to an isolated channel fixture ready.json',
    );
    const fixture = JSON.parse(await readFile(process.env.ANELF_FIXTURE!, 'utf8')) as {
      urls: string[];
      token: string;
    };
    const fixtureDirectory = dirname(process.env.ANELF_FIXTURE!);
    await writeFile(join(fixtureDirectory, 'desktop.json'), JSON.stringify(connection));
    await openSettings();
    if (index === 0) {
      const client = await connectMcp();
      try {
        const configured = await client.callTool({
          name: 'pet_configure_connection',
          arguments: { baseUrl: fixture.urls[index]!, token: fixture.token, connect: false },
        });
        expect(configured.isError).not.toBe(true);
        expect(configured.structuredContent).toMatchObject({ connection: { status: 'offline' } });
        await expect(panel.getByLabel('频道地址')).toHaveValue(fixture.urls[index]!);
      } finally {
        await client.close();
      }
    } else {
      await panel.getByLabel('频道地址').fill(fixture.urls[index]!);
      await panel.getByLabel('API Token', { exact: true }).fill(fixture.token);
    }
    await panel.locator('.connection-advanced').evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
    });
    await panel.getByLabel('技能名称', { exact: true }).fill(index ? '   ' : '');
    await panel.getByRole('button', { name: '保存并连接' }).click();
    await expect(panel.locator('.connection')).toContainText('已连接');
    const settings = JSON.parse(await readFile(join(data, 'settings.json'), 'utf8'));
    expect(settings.connection.skillName).toBe('');
    await panel.screenshot({ path: `test-results/channel-skill-${scheme}.png` });
    await panel.getByRole('button', { name: '收起浮层' }).click();
    await pet.locator('.pet-body').dblclick({ force: true });
    await pet.getByRole('textbox', { name: '发送消息' }).fill('请向我提问');
    await pet.getByRole('button', { name: '发送消息', exact: true }).click();
    await expect(pet.getByText('真实频道已连接，继续吗？')).toBeVisible();
    await pet.getByRole('button', { name: '继续', exact: true }).click();
    await expect(pet.getByText('回执已收到：继续', { exact: true })).toBeVisible();
    const evidence = JSON.parse(
      await readFile(join(fixtureDirectory, `evidence-${scheme.toLowerCase()}.json`), 'utf8'),
    );
    expect(evidence).toMatchObject({
      message: '[skill:anelfbodied-control]\n请向我提问',
      skill: 'anelfbodied-control',
      mcp: 'fixture-desktop',
      receipt: { status: 'completed', results: [{ outcome: 'completed', answer: '继续' }] },
    });
  });
}

async function connectMcp() {
  const client = new Client({ name: 'connection-e2e', version: '1' });
  await client.connect(
    new StreamableHTTPClientTransport(new URL('/mcp', connection.url), {
      requestInit: { headers: { Authorization: `Bearer ${connection.token}` } },
    }),
  );
  return client;
}

test('channel settings distinguish failure, handshake, synchronization and recovery', async () => {
  let stream: ServerResponse | undefined;
  let history: ServerResponse | undefined;
  const server = createServer((req, res) => {
    const path = new URL(req.url!, 'http://localhost').pathname;
    if (path === '/api/chat/stream') stream = res;
    else if (path === '/api/sessions/history') history = res;
    else res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test port');
  await new Promise<void>((resolve) => server.close(() => resolve()));
  try {
    await openSettings();
    await panel.getByLabel('频道地址').fill(`http://127.0.0.1:${address.port}`);
    await panel.getByRole('button', { name: '保存并连接' }).click();
    await expect(panel.locator('.connection')).toHaveText('连接失败');
    await expect(panel.getByRole('alert')).toContainText('服务未启动或端口不可达');
    await expect(panel.getByText('配置已保存', { exact: true })).toBeVisible();
    await expect(panel.getByRole('button', { name: '重试连接' })).toBeEnabled();
    const status = panel.locator('[aria-label="频道状态"]');
    await expect(status).toBeVisible();
    await panel.screenshot({ path: 'test-results/channel-failure.png' });

    await new Promise<void>((resolve) => server.listen(address.port, '127.0.0.1', resolve));
    await panel.getByRole('button', { name: '重试连接' }).click();
    await expect.poll(() => Boolean(stream)).toBe(true);
    await expect(panel.locator('.connection')).toHaveText('连接中');
    await expect(panel.getByRole('button', { name: '正在连接…' })).toBeDisabled();
    await expect(panel.getByRole('button', { name: '取消连接' })).toBeEnabled();
    await expect(panel.getByLabel('频道地址')).toBeDisabled();
    await expect(panel.getByRole('alert')).not.toBeVisible();
    stream!.writeHead(401).end();
    stream = undefined;
    await expect(panel.getByRole('alert')).toContainText('认证失败');
    await expect(panel.getByRole('button', { name: '重试连接' })).toBeEnabled();

    await panel.getByRole('button', { name: '重试连接' }).click();
    await expect.poll(() => Boolean(stream)).toBe(true);
    stream!.writeHead(200, { 'Content-Type': 'text/event-stream' });
    stream!.write(': connected\n\n');
    await expect.poll(() => Boolean(history)).toBe(true);
    await expect(panel.locator('.connection')).toHaveText('同步历史');
    await expect(panel.getByRole('button', { name: '正在同步…' })).toBeDisabled();
    await expect(panel.locator('.configuration-conflict')).not.toBeVisible();
    await expect(status).toContainText('实时连接已建立');
    await panel.screenshot({ path: 'test-results/channel-syncing.png' });
    history!.setHeader('Content-Type', 'application/json');
    history!.end(JSON.stringify({ messages: [] }));
    await expect(panel.locator('.connection')).toHaveText('已连接');
    await expect(panel.getByRole('button', { name: '已连接', exact: true })).toBeDisabled();
    await expect(panel.getByRole('alert')).not.toBeVisible();

    stream!.end();
    await expect(panel.locator('.connection')).toHaveText('重连中');
    await expect(status).toContainText('自动重试');
    await panel.getByRole('button', { name: '停止重连' }).click();
    await expect(panel.locator('.connection')).toHaveText('未连接');
    await expect(panel.getByRole('button', { name: '保存并连接' })).toBeEnabled();
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('channel preserves speech and sends setup with the live MCP configuration only on demand', async () => {
  let stream: ServerResponse | undefined;
  const received: Record<string, unknown>[] = [];
  const server = createServer(async (req, res) => {
    const path = new URL(req.url!, 'http://localhost').pathname;
    if (path === '/api/chat/stream') {
      stream = res;
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(': connected\n\n');
    } else if (path === '/api/sessions/history') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ messages: [] }));
    } else if (path === '/api/chat') {
      let raw = '';
      for await (const chunk of req) raw += String(chunk);
      received.push(JSON.parse(raw));
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'accepted' }));
    } else res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test port');
  try {
    await openSettings();
    await panel.getByLabel('频道地址').fill(`http://127.0.0.1:${address.port}`);
    await expect(panel.getByLabel('技能名称', { exact: true })).toHaveValue('');
    await panel.getByRole('button', { name: '保存并连接' }).click();
    await expect(panel.locator('.connection')).toHaveText('已连接');
    expect(received).toHaveLength(0);
    await panel.locator('.connection-advanced').evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
    });
    await panel.getByLabel('技能名称', { exact: true }).fill('   ');
    await panel.getByRole('button', { name: '保存并连接' }).click();
    await expect(panel.getByLabel('技能名称', { exact: true })).toHaveValue('');
    expect(received).toHaveLength(0);
    await panel.getByRole('button', { name: '收起浮层' }).click();
    await pet.locator('.pet-body').dblclick({ force: true });
    await pet.getByRole('textbox', { name: '发送消息' }).fill('解释这段 JSON');
    await pet.getByRole('button', { name: '发送消息', exact: true }).click();
    await expect.poll(() => received.length).toBe(1);
    expect(received[0]).toMatchObject({
      message: '解释这段 JSON',
      skills: ['anelfbodied-control'],
    });
    stream!.write(`data: ${JSON.stringify({ type: 'delta', delta: '{"protocol":' })}\n\n`);
    await expect(pet.locator('.bubble-text.draft')).toHaveText('{"protocol":');
    const speech = JSON.stringify({
      protocol: 'desktop-pet/1',
      commands: [{ action: 'ask', question: '这是示例' }],
    });
    for (const frame of [{ type: 'reply', content: speech }, { type: 'turn_end' }])
      stream!.write(`data: ${JSON.stringify(frame)}\n\n`);
    await expect(pet.locator('.bubble-text')).toHaveText(speech);
    await expect(pet.locator('.bubble-answer')).not.toBeVisible();
    await openSettings();
    await panel.getByRole('button', { name: '对话记录', exact: true }).click();
    await expect(panel.locator('.history-view')).toContainText(speech);
    expect(received).toHaveLength(1);
    await panel.getByRole('button', { name: '连接设置', exact: true }).click();
    const setup = panel.getByRole('button', { name: '让 AI 安装技能', exact: true });
    await expect(setup).toBeEnabled();
    const guideDetails = panel.locator('.channel-guide summary');
    await expect(panel.locator('.guide-preview')).not.toBeVisible();
    await guideDetails.click();
    await expect(panel.locator('.guide-preview')).toContainText(`${connection.url}/mcp`);
    await expect(panel.locator('.guide-preview')).toContainText(`Bearer ${connection.token}`);
    await guideDetails.click();
    await setup.click();
    await expect.poll(() => received.length).toBe(2);
    expect(received[1]).not.toHaveProperty('skills');
    expect(String(received[1]?.message)).toContain(`"url": "${connection.url}/mcp"`);
    expect(String(received[1]?.message)).toContain(`"Authorization": "Bearer ${connection.token}"`);
    expect(String(received[1]?.message)).toContain('set_skill_mcp_servers');
    expect(String(received[1]?.message)).toContain('name="anelfbodied-control"');
    expect(String(received[1]?.message)).toContain('才回复“安装完成”');
    expect(String(received[1]?.message)).toContain('回复“安装未完成”');
    await expect(setup).toBeDisabled();
    await expect(guideDetails).toContainText('等待结果');
    await panel.screenshot({ path: 'test-results/channel-guide.png' });
    const result = '安装完成：anelfbodied-control 已就绪，MCP 已绑定并连接。';
    for (const frame of [{ type: 'reply', content: result }, { type: 'turn_end' }])
      stream!.write(`data: ${JSON.stringify(frame)}\n\n`);
    await expect(guideDetails).toContainText('收到回复');
    await guideDetails.click();
    await expect(panel.locator('.guide-reply')).toHaveText(result);
    await panel.getByRole('button', { name: '对话记录', exact: true }).click();
    await panel.getByRole('button', { name: '连接设置', exact: true }).click();
    await expect(guideDetails).toContainText('收到回复');
    await guideDetails.click();
    await expect(panel.locator('.guide-reply')).toHaveText(result);
    await expect(setup).toBeEnabled();
    await setup.click();
    await expect.poll(() => received.length).toBe(3);
    await expect(panel.locator('.guide-reply')).not.toBeVisible();
    for (const frame of [
      { type: 'reply', content: '安装未完成：MCP 地址不可达。' },
      { type: 'turn_end' },
    ])
      stream!.write(`data: ${JSON.stringify(frame)}\n\n`);
    await expect(panel.locator('.guide-reply')).toHaveText('安装未完成：MCP 地址不可达。');
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('MCP configuration stays redacted, updates the UI and prevents stale form edits', async () => {
  await openSettings();
  const client = await connectMcp();
  try {
    const tools = await client.listTools();
    expect(
      tools.tools.find((tool) => tool.name === 'pet_configure_connection')?.inputSchema.properties,
    ).not.toHaveProperty('skillName');
    const invalid = await client.callTool({
      name: 'pet_configure_connection',
      arguments: { skillName: 'anelfbodied-control', connect: false },
    });
    expect(invalid.isError).toBe(true);
    const configured = await client.callTool({
      name: 'pet_configure_connection',
      arguments: {
        baseUrl: 'https://channel.example',
        token: 'configuration-test-secret',
        userId: 'agent-user',
        sessionId: 'agent-session',
        connect: false,
      },
    });
    expect(configured.isError).not.toBe(true);
    expect(JSON.stringify(configured)).not.toContain('configuration-test-secret');
    await expect(panel.getByLabel('用户标识')).toHaveValue('agent-user');
    const state = configured.structuredContent as unknown as ConnectionOverview;
    await panel.locator('.connection-advanced').evaluate((element) => {
      (element as HTMLDetailsElement).open = true;
    });
    await panel.getByLabel('技能名称', { exact: true }).fill('local-draft');
    await client.callTool({
      name: 'pet_configure_connection',
      arguments: { sessionId: 'agent-updated', connect: false },
    });
    await expect(
      panel.getByText('连接配置已由其他入口更新，请载入最新配置后再编辑。'),
    ).toBeVisible();
    await expect(panel.getByRole('button', { name: '保存并连接' })).toBeDisabled();
    await expect(panel.getByLabel('技能名称', { exact: true })).toHaveValue('local-draft');
    const stale = await client.callTool({
      name: 'pet_configure_connection',
      arguments: { userId: 'stale', expectedRevision: state.revision, connect: false },
    });
    expect(stale.isError).toBe(true);
    await panel.getByRole('button', { name: '载入最新配置' }).click();
    await expect(panel.getByLabel('会话标识')).toHaveValue('agent-updated');
    await expect(panel.getByLabel('技能名称', { exact: true })).toHaveValue('');
    const persisted = await readFile(join(data, 'settings.json'), 'utf8');
    expect(persisted).not.toContain('configuration-test-secret');
    await panel.getByRole('button', { name: 'MCP / 消息协议', exact: true }).click();
    await app.evaluate(({ clipboard }) => {
      clipboard.writeText = async (text) => {
        (globalThis as typeof globalThis & { copiedMcp: string }).copiedMcp = text;
      };
    });
    await panel.getByRole('button', { name: '复制 MCP 配置', exact: true }).click();
    await expect(panel.getByRole('button', { name: '已复制 MCP 配置' })).toBeVisible();
    const copied = await app.evaluate(() =>
      JSON.parse((globalThis as typeof globalThis & { copiedMcp: string }).copiedMcp),
    );
    expect(copied.mcpServers.AnelfBodied).toMatchObject({
      type: 'http',
      url: `${connection.url}/mcp`,
      headers: { Authorization: `Bearer ${connection.token}` },
    });
    await panel.screenshot({ path: 'test-results/mcp-configuration.png' });
  } finally {
    await client.close();
  }
});

test('MCP SDK cancellation stops a channel handshake without losing saved settings', async () => {
  const server = createServer(() => {});
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Missing test port');
  const client = await connectMcp();
  const abort = new AbortController();
  const pending = client
    .callTool(
      {
        name: 'pet_configure_connection',
        arguments: { baseUrl: `http://127.0.0.1:${address.port}`, userId: 'cancel-test' },
      },
      undefined,
      { signal: abort.signal },
    )
    .catch((error) => error);
  const snapshot = async () =>
    (await client.callTool({ name: 'pet_connection_state', arguments: {} }))
      .structuredContent as unknown as ConnectionOverview;
  try {
    await expect.poll(async () => (await snapshot()).connection.status).toBe('connecting');
    const simultaneous = await client.callTool({
      name: 'pet_configure_connection',
      arguments: { userId: 'concurrent', connect: false },
    });
    expect(simultaneous.isError).toBe(true);
    abort.abort();
    await pending;
    await expect.poll(async () => (await snapshot()).updating).toBe(false);
    expect(await snapshot()).toMatchObject({
      settings: { userId: 'cancel-test' },
      connection: { status: 'offline' },
    });
    await openSettings();
    await panel.getByRole('button', { name: '保存并连接' }).click();
    await panel.getByRole('button', { name: '取消连接', exact: true }).click();
    await expect(panel.locator('.connection')).toContainText('未连接');
    await expect(panel.getByRole('button', { name: '保存并连接' })).toBeEnabled();
  } finally {
    abort.abort();
    await pending;
    await client.close();
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('behavior mappings stay per skin, update live, and gestures clean up after pointer cancellation', async () => {
  await probePointer();
  const source = await mkdtemp(join(tmpdir(), 'embodied-behavior-e2e-'));
  await copyFile('src/renderer/public/skins/anelf/idle.png', join(source, 'pet.png'));
  const manifest = JSON.stringify({
    version: 2,
    id: 'behavior-test',
    name: '行为测试',
    type: 'png',
    model: {
      animations: {
        rest: { file: 'pet.png', frames: 1 },
        response: { file: 'pet.png', columns: 2, frames: 4, fps: 4 },
      },
    },
    actions: {
      rest: { source: 'rest' },
      response: { source: 'response', description: '自定义回应', durationMs: 2000 },
    },
    bindings: { idle: 'rest' },
  });
  await writeFile(join(source, 'manifest.json'), manifest);
  await app.evaluate(({ dialog }, directory) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [directory] });
  }, source);
  await openSettings();
  await panel.getByRole('button', { name: '更换形象', exact: true }).click();
  await panel.locator('.skin-chooser > summary').click();
  await panel.getByRole('button', { name: '导入皮肤文件夹' }).click();
  await expect
    .poll(async () => (await (await request('/v1/capabilities')).json()).model.status)
    .toBe('ready');
  const revision = (await (await request('/v1/capabilities')).json()).model.revision;
  await panel.locator('.behavior-settings > summary').click();
  await panel.getByLabel('触摸动作', { exact: true }).selectOption(JSON.stringify('response'));
  await panel.getByLabel('拎起动作', { exact: true }).selectOption(JSON.stringify('response'));
  await expect
    .poll(async () => (await (await request('/v1/capabilities')).json()).model)
    .toMatchObject({
      revision,
      status: 'ready',
      bindings: { touch: 'response', drag: 'response' },
    });
  const client = await connectMcp();
  try {
    const discovered = (await client.callTool({ name: 'pet_capabilities' }))
      .structuredContent as unknown as { model: ModelCapabilities };
    expect(discovered.model.behaviors?.some((item) => item.id === 'drag')).toBe(true);
    expect(discovered.model.bindings.touch).toBe('response');
  } finally {
    await client.close();
  }
  await panel.screenshot({ path: 'test-results/behavior-mappings.png' });
  await panel.getByRole('button', { name: '收起浮层' }).click();
  await pet.locator('.pet-body').click({ force: true });
  await expect(pet.locator('.sprite-sheet')).toHaveCSS('width', '280px');
  await expect(pet.locator('.pet-wheel')).toBeVisible();
  await pet.getByRole('button', { name: '收起轮盘' }).click();
  await expect(pet.locator('.pet-anchor')).toHaveAttribute('data-behavior', 'idle');
  const body = (await pet.locator('.pet-body').boundingBox())!;
  await pet.mouse.move(body.x + body.width / 2, body.y + body.height / 2);
  await expectPointerAt(body.x + body.width / 2, body.y + body.height / 2, false);
  await pet.mouse.down();
  await expect(pet.locator('.pet-body')).toHaveClass(/pressed/);
  await expectCaptured(true);
  await pet.mouse.move(body.x + body.width / 2 - 50, body.y + body.height / 2, { steps: 5 });
  await expect(pet.locator('.pet-anchor')).toHaveAttribute('data-behavior', 'drag');
  await pet.locator('.pet-body').dispatchEvent('pointercancel');
  await pet.mouse.up();
  await expect(pet.locator('.pet-anchor')).not.toHaveAttribute('data-behavior', 'drag');
  await expect(pet.locator('.pet-body')).not.toHaveClass(/pressed/);
  await expect(pet.locator('.pet-wheel')).not.toBeVisible();
  await expect(pet.locator('.pet-anchor')).toHaveAttribute('data-behavior', 'idle');
  const resting = (await pet.locator('.pet-body').boundingBox())!;
  for (let i = 0; i < 8; i++) {
    await pet.mouse.move(
      resting.x + resting.width * (i % 2 ? 0.6 : 0.4),
      resting.y + resting.height * 0.3,
      { steps: 12 },
    );
  }
  await expect(pet.locator('.pet-anchor')).toHaveAttribute('data-behavior', 'touch');
  await expect(pet.locator('.pet-wheel')).not.toBeVisible();
  await panel.evaluate(() =>
    window.embodied.setBehaviors({ skinId: 'behavior-test', patch: { idle: '', touch: '' } }),
  );
  await pet.reload();
  await expect
    .poll(async () => (await (await request('/v1/capabilities')).json()).model.status)
    .toBe('ready');
  await expect(pet.getByAltText('行为测试')).toBeVisible();
  expect(await readFile(join(source, 'manifest.json'), 'utf8')).toBe(manifest);
  expect(
    JSON.parse(await readFile(join(data, 'behaviors.json'), 'utf8')).skins['behavior-test'].drag,
  ).toBe('response');
  await panel.evaluate(() => window.embodied.setAppearance({ skinId: 'anelf', scale: 1 }));
  await expect(pet.getByAltText('Anelf · 银蓝猫耳')).toBeVisible();
  expect((await (await request('/v1/capabilities')).json()).model.bindings.drag).toBeUndefined();
  await pet.locator('.pet-body').click({ force: true });
  await expect(pet.locator('.pet-wheel')).toBeVisible();
  await pet.keyboard.press('ArrowRight');
  await expect(pet.getByRole('menuitem', { name: '更换形象' })).toBeFocused();
  await pet.keyboard.press('Home');
  await pet.keyboard.press('Enter');
  await expect(pet.getByRole('textbox', { name: '发送消息' })).toBeFocused();
  await expect(pet.locator('.pet-wheel')).not.toBeVisible();
});
