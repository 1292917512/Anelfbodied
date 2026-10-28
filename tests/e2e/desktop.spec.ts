import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from '@playwright/test';
import { mkdtemp, readFile, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { createServer, type ServerResponse } from 'node:http';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { PROTOCOL } from '../../src/protocol/schema';
import type { ConnectionOverview } from '../../src/contracts/connection';

const require = createRequire(import.meta.url);
let app: ElectronApplication, panel: Page, pet: Page;
let connection: { url: string; token: string };
let data: string;
const errors: string[] = [];
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
  await pet.locator('.pet-body').hover({ force: true });
  await pet.getByRole('button', { name: '连接设置', exact: true }).click();
  await expect(panel.getByLabel('频道地址')).toBeVisible();
};

test('single touch responds and double-click opens only a compact input bubble', async () => {
  await pet.locator('.pet-body').click({ force: true });
  await expect(pet.locator('.skin-frame')).toHaveClass(/patted/);
  await expect(pet.getByText('嗯？我在呀')).toBeVisible();
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
  await request(
    '/v1/commands',
    command('drag-takeover', [{ action: 'say', text: '拖动接管验证', durationMs: 30000 }]),
  );
  await expect(pet.getByText('拖动接管验证')).toBeVisible();
  await pet.locator('.pet-body').click({ force: true });
  await expect(pet.locator('.skin-frame')).toHaveClass(/patted/);
  expect((await (await request('/v1/receipts/drag-takeover')).json()).status).toBe('running');
  const box = await pet.locator('.pet-body').boundingBox();
  if (!box) throw new Error('Pet is not visible');
  await pet.mouse.move(box.x + 70, box.y + 70);
  await pet.mouse.down();
  await pet.mouse.move(box.x - 90, box.y + 20, { steps: 10 });
  await pet.mouse.up();
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
  await panel.getByRole('button', { name: '导入皮肤文件夹' }).click();
  await expect(pet.getByAltText('测试皮肤')).toBeVisible();
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
  await panel.getByRole('slider', { name: '桌宠大小' }).focus();
  await panel.keyboard.press('End');
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
  await expect(pet.locator('.pet-body')).toHaveClass(/happy/);
  expect(
    await pet.locator('.pet-tools').evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.right <= innerWidth && bounds.bottom <= innerHeight;
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
    await panel.getByLabel('技能名称', { exact: true }).fill('anelfbodied-control');
    await panel.getByRole('button', { name: '保存并连接' }).click();
    await expect(panel.locator('.connection')).toContainText('已连接');
    const settings = JSON.parse(await readFile(join(data, 'settings.json'), 'utf8'));
    expect(settings.connection.skillName).toBe('anelfbodied-control');
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
    const status = panel.getByRole('status', { name: '频道状态' });
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

test('channel speech preserves JSON text in streaming, bubbles and history', async () => {
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
    await panel.getByLabel('技能名称', { exact: true }).fill('anelfbodied-control');
    await panel.getByRole('button', { name: '保存并连接' }).click();
    await expect(panel.locator('.connection')).toHaveText('已连接');
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
