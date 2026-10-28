import type { UpdateState } from '../../contracts/update';

export function UpdatePanel({
  state,
  run,
}: {
  state: UpdateState;
  run(task: () => Promise<unknown>): void;
}) {
  const pending = ['checking', 'downloading', 'installing'].includes(state.phase);
  const action =
    state.phase === 'ready' ? 'install' : state.phase === 'available' ? 'download' : 'check';
  const text =
    state.phase === 'checking'
      ? '检查中…'
      : state.phase === 'downloading'
        ? '下载中…'
        : state.phase === 'installing'
          ? '正在升级…'
          : action === 'install'
            ? '重启并升级'
            : action === 'download'
              ? '下载更新'
              : '检查更新';
  return (
    <section className="update-card" aria-label="应用更新">
      <div className="update-row">
        <div>
          <strong>Embodied</strong>
          <span>
            v{state.currentVersion}
            {state.nextVersion ? ` → ${state.nextVersion}` : ''}
          </span>
        </div>
        <button
          disabled={!state.supported || pending}
          onClick={() => run(() => window.embodied.update(action))}
        >
          {text}
        </button>
      </div>
      {state.phase === 'downloading' && (
        <>
          <progress max={state.total || 1} value={state.received} aria-label="更新下载进度" />
          <div className="update-row">
            <small>
              {(state.received / 1048576).toFixed(1)} / {(state.total / 1048576).toFixed(1)} MB
            </small>
            <button
              className="text-button"
              onClick={() => run(() => window.embodied.update('cancel'))}
            >
              取消下载
            </button>
          </div>
        </>
      )}
      {state.detail && <p role="status">{state.detail}</p>}
      {!state.supported && <p>开发模式下通过源码更新</p>}
    </section>
  );
}
