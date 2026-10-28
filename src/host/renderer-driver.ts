import type { WebContents } from 'electron';
import { PresentationDriver } from '../runtime/presentation-driver';

/** Adapts Electron IPC and renderer lifecycle to the shared presentation driver. */
export function createRendererDriver(contents: WebContents): PresentationDriver {
  const driver = new PresentationDriver({
    send: (order) => contents.send('pet:order', order),
    reset: () => {
      if (!contents.isDestroyed()) contents.forcefullyCrashRenderer();
    },
  });
  contents.on('render-process-gone', () => driver.disconnected('Renderer process exited'));
  contents.on('did-start-loading', () => driver.disconnected('Renderer reloaded'));
  contents.on('destroyed', () => driver.disconnected('Desktop window closed'));
  return driver;
}
