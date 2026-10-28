import { EventEmitter } from 'node:events';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  renameSync,
} from 'node:fs';
import { open, rename, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import type { UpdateState } from '../contracts/update';
import { newer, releaseSchema, type Release, type ReleaseSource } from './source';

/** Owns one verified update and removes partial or obsolete downloads. */
export class Updater extends EventEmitter {
  private state: UpdateState;
  private release?: Release;
  private active?: AbortController;
  private finished = Promise.resolve();
  private finish?: () => void;
  private cleanupTimer?: ReturnType<typeof setTimeout>;
  private readonly executable: string;
  private readonly partial: string;
  private readonly metadata: string;
  constructor(
    directory: string,
    currentVersion: string,
    supported: boolean,
    private readonly source: ReleaseSource,
  ) {
    super();
    mkdirSync(directory, { recursive: true });
    this.executable = join(directory, 'installer.exe');
    this.partial = join(directory, 'download.part');
    this.metadata = join(directory, 'release.json');
    this.state = { phase: 'idle', currentVersion, supported, received: 0, total: 0, detail: '' };
    rmSync(this.partial, { force: true });
    try {
      const release = releaseSchema.parse(JSON.parse(readFileSync(this.metadata, 'utf8')));
      if (newer(release.version, currentVersion) && existsSync(this.executable)) {
        this.release = release;
        this.state = {
          ...this.state,
          phase: 'ready',
          nextVersion: release.version,
          total: release.size,
          received: release.size,
        };
      } else this.clean();
    } catch {
      this.clean();
    }
  }
  snapshot(): UpdateState {
    return { ...this.state };
  }
  private change(next: Partial<UpdateState>): void {
    Object.assign(this.state, next);
    this.emit('state');
  }
  private clean(attempt = 0): void {
    clearTimeout(this.cleanupTimer);
    try {
      for (const file of [this.executable, this.metadata, `${this.metadata}.tmp`, this.partial])
        rmSync(file, { force: true });
    } catch {
      if (attempt < 6) this.cleanupTimer = setTimeout(() => this.clean(attempt + 1), 10000).unref();
    }
  }
  private begin(phase: 'checking' | 'downloading'): AbortController {
    if (!this.state.supported) throw new Error('请使用 Windows 安装版进行更新');
    if (this.active || this.state.phase === 'installing') throw new Error('更新操作正在进行');
    const abort = new AbortController();
    clearTimeout(this.cleanupTimer);
    this.finished = new Promise((resolve) => {
      this.finish = resolve;
    });
    this.active = abort;
    this.change({ phase, detail: '' });
    return abort;
  }
  async check(): Promise<void> {
    const abort = this.begin('checking');
    try {
      const release = await this.source.latest(
        AbortSignal.any([abort.signal, AbortSignal.timeout(15000)]),
      );
      if (!release || !newer(release.version, this.state.currentVersion)) {
        this.release = undefined;
        this.clean();
        this.change({
          phase: 'current',
          nextVersion: undefined,
          received: 0,
          total: 0,
          detail: release ? '已是最新版本' : '暂无已发布版本',
        });
      } else {
        const cached = this.release?.sha256 === release.sha256 && existsSync(this.executable);
        if (!cached) this.clean();
        this.release = release;
        this.change({
          phase: cached ? 'ready' : 'available',
          nextVersion: release.version,
          received: cached ? release.size : 0,
          total: release.size,
        });
      }
    } catch (error) {
      this.failed(error, abort);
    } finally {
      this.active = undefined;
      this.finish?.();
    }
  }
  async download(): Promise<void> {
    if (!this.release) throw new Error('请先检查更新');
    const release = this.release;
    const abort = this.begin('downloading');
    this.change({ received: 0, total: release.size });
    let file: Awaited<ReturnType<typeof open>> | undefined;
    try {
      await rm(this.partial, { force: true });
      const signal = AbortSignal.any([abort.signal, AbortSignal.timeout(15 * 60000)]);
      const response = await this.source.download(release, signal);
      if (!response.ok || !response.body)
        throw new Error(`下载安装包失败（HTTP ${response.status}）`);
      file = await open(this.partial, 'wx');
      const hash = createHash('sha256');
      let received = 0,
        lastPublished = 0;
      for await (const chunk of response.body) {
        signal.throwIfAborted();
        received += chunk.byteLength;
        if (received > release.size) throw new Error('安装包大小不匹配');
        hash.update(chunk);
        await file.writeFile(chunk);
        if (Date.now() - lastPublished > 100) {
          this.change({ received });
          lastPublished = Date.now();
        }
      }
      if (received !== release.size || hash.digest('hex') !== release.sha256)
        throw new Error('安装包校验失败，请重新下载');
      await file.sync();
      await file.close();
      file = undefined;
      await rename(this.partial, this.executable);
      writeFileSync(`${this.metadata}.tmp`, JSON.stringify(release), { mode: 0o600, flush: true });
      renameSync(`${this.metadata}.tmp`, this.metadata);
      this.change({ phase: 'ready', received });
    } catch (error) {
      await file?.close().catch(() => {});
      await rm(this.partial, { force: true }).catch(() => {});
      this.failed(error, abort);
    } finally {
      this.active = undefined;
      this.finish?.();
    }
  }
  private failed(error: unknown, abort: AbortController): void {
    this.change({
      phase: abort.signal.aborted ? (this.release ? 'available' : 'idle') : 'error',
      detail: abort.signal.aborted ? '已取消' : error instanceof Error ? error.message : '更新失败',
    });
  }
  cancel(): void {
    this.active?.abort();
  }
  async close(): Promise<void> {
    clearTimeout(this.cleanupTimer);
    this.cancel();
    await this.finished;
  }
  async installer(): Promise<string> {
    if (!this.state.supported || this.active || this.state.phase !== 'ready' || !this.release)
      throw new Error('安装包尚未准备好');
    this.change({ phase: 'installing', detail: '正在退出并升级…' });
    try {
      const hash = createHash('sha256');
      for await (const chunk of createReadStream(this.executable)) hash.update(chunk);
      if (hash.digest('hex') !== this.release.sha256) throw new Error('安装包已变化，请重新下载');
      return this.executable;
    } catch (error) {
      this.clean();
      this.change({ phase: 'error', detail: '安装包不可用，请重新下载' });
      throw error;
    }
  }
}
