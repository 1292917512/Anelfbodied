import { BrowserWindow, Menu, screen, dialog } from 'electron';
import { petAnchor, panelAnchor, type Point } from '../shared/geometry';
import type { PanelView } from './contracts';

/** Owns the floating windows, placement and bounded renderer recovery. */
export function createDesktop(
  preload: string,
  log: (event: string, detail?: string) => void,
  isQuitting: () => boolean,
) {
  Menu.setApplicationMenu(null);
  const webPreferences = {
    preload,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
  };
  const pet = new BrowserWindow({
    ...screen.getPrimaryDisplay().workArea,
    transparent: true,
    frame: false,
    resizable: false,
    skipTaskbar: true,
    hasShadow: false,
    show: false,
    webPreferences,
  });
  pet.setAlwaysOnTop(true, 'floating');
  pet.setIgnoreMouseEvents(true, { forward: true });
  const panel = new BrowserWindow({
    width: 400,
    height: 600,
    minWidth: 360,
    minHeight: 460,
    maxWidth: 560,
    frame: false,
    transparent: true,
    skipTaskbar: true,
    show: false,
    title: 'Embodied · 桌面伙伴',
    webPreferences,
  });
  panel.setAlwaysOnTop(true, 'floating');
  let position: Point = { x: 0.78, y: 0.75 };
  let scale = 1;
  const showPanel = (view?: PanelView) => {
    if (view) panel.webContents.send('app:view', view);
    const area = pet.getBounds();
    panel.setMinimumSize(Math.min(360, area.width - 24), Math.min(460, area.height - 24));
    const current = panel.getBounds();
    if (current.width > area.width - 24 || current.height > area.height - 24)
      panel.setSize(
        Math.min(current.width, area.width - 24),
        Math.min(current.height, area.height - 24),
      );
    const anchor = petAnchor(area, position, scale);
    const location = panelAnchor(
      area,
      panel.getBounds(),
      {
        x: area.x + anchor.x,
        y: area.y + anchor.y,
      },
      140 * scale,
    );
    panel.setPosition(location.x, location.y);
    panel.show();
    panel.focus();
  };
  const updateDisplay = () => {
    if (pet.isDestroyed()) return;
    pet.setBounds(screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).workArea);
    if (panel.isVisible()) showPanel();
  };
  for (const window of [pet, panel]) {
    const role = window === pet ? 'pet' : 'panel';
    let failures: number[] = [];
    window.webContents.on('render-process-gone', (_event, details) => {
      log('renderer-exited', `${role} ${details.reason} ${details.exitCode}`);
      if (isQuitting()) return;
      failures = failures.filter((time) => time > Date.now() - 60000);
      failures.push(Date.now());
      if (failures.length > 3) {
        if (!process.env.EMBODIED_TEST)
          dialog.showErrorBox(
            'Embodied 显示异常',
            '显示进程反复退出，请重新启动并检查 runtime.log。',
          );
        return;
      }
      setTimeout(() => {
        if (!isQuitting() && !window.isDestroyed()) window.reload();
      }, 300);
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    );
    window.on('close', (event) => {
      if (!isQuitting()) {
        event.preventDefault();
        window.hide();
      }
    });
  }
  screen.on('display-metrics-changed', updateDisplay);
  screen.on('display-removed', updateDisplay);
  return {
    pet,
    panel,
    showPanel,
    updateDisplay,
    scale: (value: number) => {
      scale = value;
      if (panel.isVisible()) showPanel();
    },
    position: (point: Point) => {
      position = point;
    },
  };
}
