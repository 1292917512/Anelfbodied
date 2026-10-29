import { screen, type BrowserWindow } from 'electron';
import { normalizePet, petDisplaySize, type Point } from '../shared/geometry';

/** Tracks a captured drag in desktop DIP coordinates across monitor boundaries. */
export class PetDrag {
  private timer?: ReturnType<typeof setInterval>;
  private grab?: Point;
  private previous?: string;

  constructor(
    private readonly window: BrowserWindow,
    private readonly scale: () => number,
    private readonly position: (point: Point | null) => void,
    private readonly capture: (enabled: boolean) => void,
  ) {
    const stop = () => this.stop();
    window.on('blur', stop);
    window.on('hide', stop);
    window.on('closed', stop);
    window.webContents.on('render-process-gone', stop);
    window.webContents.on('did-start-loading', stop);
  }

  start(grab: Point): void {
    if (this.grab) return;
    this.grab = grab;
    this.previous = undefined;
    this.tick();
    if (!this.grab) return;
    this.timer = setInterval(() => this.tick(), 16);
    this.timer.unref();
  }

  stop(final = false): void {
    if (final) this.tick();
    clearInterval(this.timer);
    this.timer = undefined;
    if (!this.grab) return;
    this.grab = undefined;
    this.capture(false);
    this.position(null);
  }

  private tick(): void {
    if (!this.grab) return;
    if (this.window.isDestroyed() || !this.window.isVisible()) return this.stop();
    const cursor = screen.getCursorScreenPoint();
    const area = screen.getDisplayNearestPoint(cursor).workArea;
    const size = petDisplaySize(area, this.scale()).diameter;
    const point = normalizePet(
      area,
      {
        x: cursor.x - area.x - this.grab.x * size,
        y: cursor.y - area.y - this.grab.y * size,
      },
      this.scale(),
    );
    const bounds = this.window.getBounds();
    if (
      bounds.x !== area.x ||
      bounds.y !== area.y ||
      bounds.width !== area.width ||
      bounds.height !== area.height
    )
      this.window.setBounds(area);
    if (!this.grab) return;
    this.capture(true);
    const key = `${area.x},${area.y},${area.width},${area.height},${point.x},${point.y}`;
    if (key !== this.previous) {
      this.previous = key;
      this.position(point);
    }
  }
}
