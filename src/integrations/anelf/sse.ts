import { createParser } from 'eventsource-parser';

/** Parses fragmented SSE frames with bounded buffering and a heartbeat deadline. */
export async function consumeSse(
  response: Response,
  signal: AbortSignal,
  onData: (data: string) => void,
): Promise<void> {
  if (!response.body) throw new Error('SSE response has no body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const parser = createParser({
    onEvent: (event) => {
      if (event.data) onData(event.data);
    },
    maxBufferSize: 256000,
    onError: (error) => {
      if (error.type === 'max-buffer-size-exceeded') throw error;
    },
  });
  const abort = () => {
    void reader.cancel();
  };
  signal.addEventListener('abort', abort, { once: true });
  try {
    while (!signal.aborted) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const chunk = await Promise.race([
        reader.read(),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(() => {
            void reader.cancel();
            reject(new Error('SSE heartbeat timeout'));
          }, 65000);
        }),
      ]).finally(() => clearTimeout(timer));
      if (chunk.done) break;
      parser.feed(decoder.decode(chunk.value, { stream: true }));
    }
  } finally {
    signal.removeEventListener('abort', abort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
