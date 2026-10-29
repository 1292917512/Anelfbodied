import { CubismFramework } from '../../../vendor/cubism/Framework/live2dcubismframework';
import { alphaSampler } from '../../model/alpha-sampler';
import type { HitMask } from '../../model/hit-mask';
import { CubismUserModel } from '../../../vendor/cubism/Framework/model/cubismusermodel';
import { CubismModelSettingJson } from '../../../vendor/cubism/Framework/cubismmodelsettingjson';
import { CubismEyeBlink } from '../../../vendor/cubism/Framework/effect/cubismeyeblink';
import { CubismMatrix44 } from '../../../vendor/cubism/Framework/math/cubismmatrix44';
import { CubismMotion } from '../../../vendor/cubism/Framework/motion/cubismmotion';
import { ACubismMotion } from '../../../vendor/cubism/Framework/motion/acubismmotion';
import type { CubismIdHandle } from '../../../vendor/cubism/Framework/id/cubismid';
import type { Live2dModel } from './schema';
import type { ModelRenderer } from '../../model/renderer';
import { waitFor } from '../../model/renderer';
import { CubismShaderManager_WebGL } from '../../../vendor/cubism/Framework/rendering/cubismshader_webgl';
import { ModelAudio } from './audio';
import { canvasResolution } from './resolution';

let initialized = false;
let activeContexts = 0;
function initialize(): void {
  if (initialized) return;
  if (!CubismFramework.startUp()) throw new Error('Cubism Core 初始化失败');
  CubismFramework.initialize();
  initialized = true;
}
async function read(url: string, signal: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`模型资源无法读取：${new URL(url).pathname}`);
  return response.arrayBuffer();
}

/** Adapts Cubism motion, expression, physics and drawing to the model interface. */
class CubismActor extends CubismUserModel {
  private readonly motions = new Map<string, ACubismMotion>();
  private readonly textures: WebGLTexture[] = [];
  private setting!: CubismModelSettingJson;
  private selected?: string;
  private generation = 0;
  private disposed = false;
  private readonly audio = new ModelAudio();
  constructor(
    private readonly config: Live2dModel,
    private readonly gl: WebGLRenderingContext | WebGL2RenderingContext,
    private readonly muted: boolean,
  ) {
    super();
  }
  async load(signal: AbortSignal): Promise<void> {
    const bytes = await read(this.config.url, signal);
    this.setting = new CubismModelSettingJson(bytes, bytes.byteLength);
    const resource = (file: string) => new URL(file, this.config.url).href;
    const moc = await read(resource(this.setting.getModelFileName()), signal);
    try {
      this.loadModel(moc, true);
    } catch {
      throw new Error('Live2D 模型已损坏或版本不受支持');
    }
    if (!this.getModel()) throw new Error('模型版本不受支持或 MOC3 已损坏');
    const physics = this.setting.getPhysicsFileName(),
      pose = this.setting.getPoseFileName();
    if (physics) {
      const data = await read(resource(physics), signal);
      this.loadPhysics(data, data.byteLength);
    }
    if (pose) {
      const data = await read(resource(pose), signal);
      this.loadPose(data, data.byteLength);
    }
    this._eyeBlink = CubismEyeBlink.create(this.setting);
    const model = this.getModel(),
      matrix = this.getModelMatrix();
    if (model.getCanvasWidth() > model.getCanvasHeight()) matrix.setWidth(1.9);
    else matrix.setHeight(1.9);
    const layout = new Map<string, number>();
    this.setting.getLayoutMap(layout);
    matrix.setupFromLayout(layout);
    matrix.scaleRelative(this.config.view.zoom, this.config.view.zoom);
    matrix.translateRelative(this.config.view.x, this.config.view.y);
    model.saveParameters();
    this.createRenderer(this.gl.canvas.width, this.gl.canvas.height);
    const renderer = this.getRenderer();
    renderer.startUp(this.gl);
    renderer.setIsPremultipliedAlpha(true);
    renderer.loadShaders('./vendor/shaders/');
    const shader = CubismShaderManager_WebGL.getInstance().getShader(this.gl);
    const deadline = performance.now() + 15000;
    while (!shader._isShaderLoaded) {
      if (performance.now() > deadline) throw new Error('Live2D 着色器加载失败，请检查应用资源');
      await waitFor(16, signal);
    }
    for (let i = 0; i < this.setting.getTextureCount(); i++) {
      const data = await read(resource(this.setting.getTextureFileName(i)), signal);
      const bitmap = await createImageBitmap(new Blob([data]), { premultiplyAlpha: 'premultiply' });
      try {
        signal.throwIfAborted();
        const texture = this.gl.createTexture();
        if (!texture) throw new Error('无法分配模型纹理');
        this.textures.push(texture);
        this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
        this.gl.texImage2D(
          this.gl.TEXTURE_2D,
          0,
          this.gl.RGBA,
          this.gl.RGBA,
          this.gl.UNSIGNED_BYTE,
          bitmap,
        );
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
        renderer.bindTexture(i, texture);
      } finally {
        bitmap.close();
      }
    }
    signal.throwIfAborted();
  }
  async play(name: string, signal: AbortSignal): Promise<void> {
    this.stop();
    const generation = this.generation;
    const sourceName = Object.hasOwn(this.config.aliases, name) ? this.config.aliases[name]! : name;
    const source = this.config.sources[sourceName];
    if (!source) throw new Error(`Live2D 动作不存在：${name}`);
    if (source.kind === 'sound') {
      this.selected = sourceName;
      if (source.sound && !this.muted) await this.audio.play(source.sound, signal);
      return;
    }
    let motion = this.motions.get(sourceName);
    if (!motion) {
      const data = await read(source.file!, signal);
      signal.throwIfAborted();
      if (this.disposed || generation !== this.generation) return;
      motion =
        source.kind === 'expression'
          ? this.loadExpression(data, data.byteLength, name)
          : this.loadMotion(data, data.byteLength, name);
      if (!motion) throw new Error(`Live2D 动作无法加载：${name}`);
      if (source.fadeIn !== undefined) motion.setFadeInTime(source.fadeIn);
      if (source.fadeOut !== undefined) motion.setFadeOutTime(source.fadeOut);
      if (motion instanceof CubismMotion) {
        const eye = new Array<CubismIdHandle>(),
          lip = new Array<CubismIdHandle>();
        for (let i = 0; i < this.setting.getEyeBlinkParameterCount(); i++)
          eye.push(this.setting.getEyeBlinkParameterId(i));
        for (let i = 0; i < this.setting.getLipSyncParameterCount(); i++)
          lip.push(this.setting.getLipSyncParameterId(i));
        motion.setEffectIds(eye, lip);
        motion.setLoop(true);
      }
      this.motions.set(sourceName, motion);
    }
    signal.throwIfAborted();
    if (this.disposed || generation !== this.generation) return;
    this.selected = sourceName;
    if (source.kind === 'expression') this._expressionManager.startMotion(motion, false);
    else this._motionManager.startMotionPriority(motion, false, 3);
    if (source.sound && !this.muted) await this.audio.play(source.sound, signal);
  }
  stop(): void {
    this.generation++;
    this.audio.stop();
    this.selected = undefined;
    this._motionManager.stopAllMotions();
    this._expressionManager.stopAllMotions();
    this.getModel()?.loadParameters();
  }
  frame(delta: number): void {
    if (this.disposed) return;
    const model = this.getModel();
    model.loadParameters();
    const updated = this._motionManager.updateMotion(model, delta);
    if (!updated) this._eyeBlink?.updateParameters(model, delta);
    this._expressionManager.updateMotion(model, delta);
    this._physics?.evaluate(model, delta);
    this._pose?.updateParameters(model, delta);
    model.update();
    const gl = this.gl,
      renderer = this.getRenderer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const matrix = new CubismMatrix44();
    matrix.multiplyByMatrix(this.getModelMatrix());
    renderer.setMvpMatrix(matrix);
    renderer.setRenderState(gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer, [
      0,
      0,
      gl.canvas.width,
      gl.canvas.height,
    ]);
    renderer.drawModel();
    (gl.canvas as HTMLCanvasElement).dataset.action = this.selected ?? '';
  }
  dispose(): void {
    if (this.disposed) return;
    this.stop();
    this.disposed = true;
    this.audio.dispose();
    for (const motion of this.motions.values()) ACubismMotion.delete(motion);
    this.motions.clear();
    this.release();
    this.setting?.release();
    for (const texture of this.textures) this.gl.deleteTexture(texture);
  }
}
export const live2dRenderer: ModelRenderer = {
  type: 'live2d',
  async mount(host, skin, signal, failed, preferences) {
    initialize();
    signal.throwIfAborted();
    const sample = alphaSampler();
    const canvas = document.createElement('canvas');
    canvas.className = 'live2d-canvas';
    canvas.setAttribute('aria-label', skin.name);
    canvas.width = canvas.height = 512;
    host.append(canvas);
    const options: WebGLContextAttributes = {
      alpha: true,
      premultipliedAlpha: true,
      antialias: true,
    };
    const gl = (canvas.getContext('webgl2', options) ?? canvas.getContext('webgl', options)) as
      WebGLRenderingContext | WebGL2RenderingContext | null;
    if (!gl) {
      canvas.remove();
      throw new Error('当前设备无法创建 WebGL 上下文');
    }
    const resolution = canvasResolution(
      canvas,
      host,
      Math.min(2048, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number),
    );
    resolution.update();
    const actor = new CubismActor(skin.model as Live2dModel, gl, preferences?.muted ?? false);
    let mask: HitMask | undefined;
    let sampledAt = -Infinity;
    let requestedAt = performance.now();
    const sampleOpacity = (now: number) => {
      if (now - sampledAt < 80 || now - requestedAt > 200) return;
      mask = sample((context, size) => context.drawImage(canvas, 0, 0, size, size));
      sampledAt = now;
    };
    activeContexts++;
    let disposed = false;
    let frame = 0,
      last = performance.now();
    const lost = (event: Event) => {
      event.preventDefault();
      cancelAnimationFrame(frame);
      failed(new Error('Live2D 显卡上下文丢失，请重新选择皮肤'));
    };
    canvas.addEventListener('webglcontextlost', lost);
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      mask = undefined;
      cancelAnimationFrame(frame);
      resolution.dispose();
      canvas.removeEventListener('webglcontextlost', lost);
      actor.dispose();
      if (--activeContexts === 0) CubismShaderManager_WebGL.deleteInstance();
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      canvas.remove();
    };
    try {
      await actor.load(signal);
      actor.frame(0);
      sampleOpacity(performance.now());
      const tick = () => {
        try {
          const now = performance.now();
          resolution.update();
          actor.frame(Math.min(0.1, (now - last) / 1000));
          sampleOpacity(now);
          last = now;
          frame = requestAnimationFrame(tick);
        } catch (error) {
          failed(error instanceof Error ? error : new Error(String(error)));
        }
      };
      frame = requestAnimationFrame(tick);
      signal.throwIfAborted();
      return {
        hitMask: () => {
          requestedAt = performance.now();
          return mask;
        },
        play: (name, signal) => actor.play(name, signal),
        stop: () => actor.stop(),
        dispose,
      };
    } catch (error) {
      dispose();
      throw error;
    }
  },
};
