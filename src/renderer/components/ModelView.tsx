import { useEffect, useRef, useState } from 'react';
import type { Skin } from '../../model/schema';
import { modelRenderers } from '../../composition/model-renderers';
import { ModelSession } from '../../model/session';

export function ModelView({
  skin,
  revision,
  behavior,
  session,
  status,
  muted = false,
  sequence = 0,
}: {
  skin: Skin;
  revision: string;
  behavior: string;
  session?: (session: ModelSession | undefined) => void;
  status?: (status: 'loading' | 'ready' | 'error', detail?: string) => void;
  muted?: boolean;
  sequence?: number;
}) {
  const host = useRef<HTMLSpanElement>(null);
  const current = useRef<ModelSession | undefined>(undefined);
  const callbacks = useRef({ session, status });
  callbacks.current = { session, status };
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    setError('');
    setLoading(true);
    const abort = new AbortController();
    const timeout = setTimeout(() => {
      runtime.fail(new Error('模型加载超时'));
      abort.abort();
    }, 20000);
    const report = (error: Error) => {
      setError(error.message);
      setLoading(false);
      callbacks.current.status?.('error', error.message.slice(0, 500));
    };
    const runtime = new ModelSession(skin, revision, report);
    current.current = runtime;
    callbacks.current.session?.(runtime);
    callbacks.current.status?.('loading');
    void (async () => {
      try {
        const instance = await modelRenderers
          .get(skin.type)
          .mount(host.current!, skin, abort.signal, (error) => runtime.fail(error), { muted });
        if (abort.signal.aborted) {
          instance.dispose();
          return;
        }
        await runtime.attach(instance);
        if (abort.signal.aborted) return;
        setLoading(false);
        callbacks.current.status?.('ready');
      } catch (error) {
        if (!abort.signal.aborted)
          runtime.fail(error instanceof Error ? error : new Error(String(error)));
      } finally {
        clearTimeout(timeout);
      }
    })();
    return () => {
      clearTimeout(timeout);
      abort.abort();
      runtime.dispose();
      current.current = undefined;
      callbacks.current.session?.(undefined);
    };
  }, [skin.id, revision, muted]);
  useEffect(() => {
    void current.current?.ambient(behavior, sequence > 0).catch(() => {});
  }, [behavior, sequence, skin.id, revision]);
  const bindings = JSON.stringify(skin.bindings);
  useEffect(() => {
    current.current?.updateBindings(JSON.parse(bindings));
  }, [bindings, skin.id, revision]);
  return (
    <span
      className="model-view"
      data-model-type={skin.type}
      data-model-status={error ? 'error' : loading ? 'loading' : 'ready'}
    >
      <span className="model-hit-point model-hit-origin" aria-hidden="true" />
      <span className="model-hit-point model-hit-horizontal" aria-hidden="true" />
      <span className="model-hit-point model-hit-vertical" aria-hidden="true" />
      <span
        ref={host}
        className="model-surface"
        style={{ visibility: error || loading ? 'hidden' : 'visible' }}
      />
      {(loading || error) && (
        <span
          className={`model-placeholder ${error ? 'failed' : 'loading'}`}
          title={error || `正在加载 ${skin.name}`}
        >
          <span className="model-placeholder-symbol" aria-hidden="true">
            {error ? '!' : '◌'}
          </span>
          <small role="status">{error ? '加载失败 · 打开设置重试' : '正在加载…'}</small>
        </span>
      )}
    </span>
  );
}
