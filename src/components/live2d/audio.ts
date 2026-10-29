/** Owns one decoded voice track and releases it on stop or model disposal. */
export class ModelAudio {
  private context?: AudioContext;
  private node?: AudioBufferSourceNode;
  private generation = 0;
  async play(url: string, signal: AbortSignal): Promise<void> {
    this.stop();
    const generation = this.generation;
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error('模型语音读取失败');
    const bytes = await response.arrayBuffer();
    signal.throwIfAborted();
    const context = (this.context ??= new AudioContext());
    const buffer = await context.decodeAudioData(bytes);
    signal.throwIfAborted();
    if (generation !== this.generation) return;
    await context.resume();
    signal.throwIfAborted();
    if (generation !== this.generation) return;
    const node = (this.node = context.createBufferSource());
    node.buffer = buffer;
    node.connect(context.destination);
    node.start();
    const abort = () => this.stop();
    signal.addEventListener('abort', abort, { once: true });
    node.onended = () => {
      signal.removeEventListener('abort', abort);
      node.disconnect();
      if (this.node === node) this.node = undefined;
    };
  }
  stop(): void {
    this.generation++;
    this.node?.stop();
    this.node?.disconnect();
    this.node = undefined;
  }
  dispose(): void {
    this.stop();
    void this.context?.close();
    this.context = undefined;
  }
}
