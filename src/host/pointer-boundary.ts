import { screen, type BrowserWindow } from 'electron';

export interface HitRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Makes only the pet and its visible controls intercept desktop input. */
export class PointerBoundary {
  private regions: HitRegion[] = [];
  private captureUntil = 0;
  private ignored = true;
  private hovered = false;
  constructor(private readonly window: BrowserWindow) {
    const timer = setInterval(() => this.update(), 40);
    timer.unref();
    window.once('closed', () => clearInterval(timer));
    window.on('blur', () => {
      this.captureUntil = 0;
    });
    window.webContents.on('render-process-gone', () => {
      this.regions = [];
      this.captureUntil = 0;
      this.update();
    });
  }
  setRegions(regions: HitRegion[]): void {
    this.regions = regions;
    this.update();
  }
  capture(enabled: boolean): void {
    this.captureUntil = enabled ? Date.now() + 2000 : 0;
    this.update();
  }
  private update(): void {
    if (this.window.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint(),
      bounds = this.window.getBounds();
    const x = cursor.x - bounds.x,
      y = cursor.y - bounds.y;
    const hovered =
      this.window.isVisible() &&
      this.regions.some(
        (region) =>
          x >= region.x &&
          y >= region.y &&
          x <= region.x + region.width &&
          y <= region.y + region.height,
      );
    const ignored = !hovered && this.captureUntil < Date.now();
    if (ignored !== this.ignored) {
      this.ignored = ignored;
      this.window.setIgnoreMouseEvents(ignored, { forward: true });
    }
    if (hovered !== this.hovered) {
      this.hovered = hovered;
      this.window.webContents.send('pet:hover', hovered);
    }
  }
}
