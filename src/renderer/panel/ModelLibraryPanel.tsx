import { useEffect, useState } from 'react';
import type { ModelLibrarySnapshot } from '../../model/source';
import type { ModelLibraryRequest } from '../../contracts/client';

export function ModelLibraryPanel() {
  const [opened, setOpened] = useState(false);
  const [catalog, setCatalog] = useState<ModelLibrarySnapshot>();
  const [busy, setBusy] = useState('正在检索模型库…');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState('');
  const [limit, setLimit] = useState(20);
  useEffect(() => {
    if (!opened) return;
    let alive = true;
    void (async () => {
      try {
        const saved = await window.embodied.modelLibrary({ action: 'list' });
        const state = await window.embodied.modelLibrary({
          action: saved.configured ? 'refresh' : 'discover',
        });
        if (alive) {
          setCatalog(state);
          setProvider(state.providers[0]?.id ?? '');
        }
      } catch (error) {
        if (alive) setError(String(error));
      } finally {
        if (alive) setBusy('');
      }
    })();
    return () => {
      alive = false;
    };
  }, [opened]);
  const execute = async (request: ModelLibraryRequest, message: string) => {
    if (busy) return;
    setBusy(message);
    setError('');
    try {
      setCatalog(await window.embodied.modelLibrary(request));
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
          : String(error),
      );
    } finally {
      setBusy('');
    }
  };
  const models =
    catalog?.models.filter((model) =>
      `${model.name} ${model.format}`.toLowerCase().includes(search.toLowerCase()),
    ) ?? [];
  return (
    <details
      className="model-library"
      onToggle={(event) => {
        if (event.currentTarget.open) setOpened(true);
      }}
    >
      <summary>
        模型库 <small>{catalog ? `· ${catalog.models.length} 个模型` : ''}</small>
      </summary>
      <p className="hint">从本地目录或 Steam 资源中直接使用，只保存引用。原文件需保留在原位置。</p>
      {catalog && catalog.providers.length > 1 && (
        <select
          aria-label="模型来源"
          value={provider}
          onChange={(event) => setProvider(event.target.value)}
        >
          {catalog.providers.map((source) => (
            <option key={source.id} value={source.id}>
              {source.name}
            </option>
          ))}
        </select>
      )}
      <div className="button-row">
        <button
          disabled={!!busy}
          onClick={() => void execute({ action: 'discover' }, '正在查找 Steam 模型库…')}
        >
          自动查找
        </button>
        <button
          disabled={!!busy}
          onClick={() => void execute({ action: 'add-folder', provider }, '正在读取目录…')}
        >
          添加目录
        </button>
        <button
          disabled={!!busy}
          onClick={() => void execute({ action: 'add-file', provider }, '正在读取模型包…')}
        >
          添加模型文件
        </button>
        <button disabled={!!busy} onClick={() => void execute({ action: 'refresh' }, '正在刷新…')}>
          刷新
        </button>
      </div>
      {busy && (
        <p className="hint" role="status">
          {busy}
        </p>
      )}
      {error && (
        <p className="model-library-error" role="alert">
          {error}
        </p>
      )}
      {!!catalog?.roots.length && (
        <details className="library-locations">
          <summary>来源目录 · {catalog.roots.length}</summary>
          {catalog.roots.map((root) => (
            <div key={`${root.provider}:${root.path}`}>
              <span title={root.path}>{root.path}</span>
              <button
                disabled={!!busy}
                aria-label={`移除来源 ${root.path}`}
                onClick={() => void execute({ action: 'remove', ...root }, '正在更新目录…')}
              >
                移除
              </button>
            </div>
          ))}
        </details>
      )}
      {catalog?.issues.map((issue) => (
        <p className="model-library-error" key={issue}>
          {issue}
        </p>
      ))}
      <input
        aria-label="搜索模型库"
        placeholder="搜索模型名称"
        value={search}
        onChange={(event) => {
          setSearch(event.target.value);
          setLimit(20);
        }}
      />
      <div className="library-models">
        {models.slice(0, limit).map((model) => (
          <div className="library-model" key={model.id}>
            <div>
              <strong>{model.name}</strong>
              <small>
                {model.format}
                {model.detail ? ` · ${model.detail}` : ' · 只读引用'}
              </small>
            </div>
            <button
              disabled={!!busy || !!model.detail}
              onClick={() =>
                void execute({ action: 'use', id: model.id }, `正在加载 ${model.name}…`)
              }
            >
              使用
            </button>
          </div>
        ))}
      </div>
      {!busy && !models.length && (
        <p className="hint">
          没有找到可用模型。可添加 Live2DViewerEX 目录、原生模型目录或导出的 WPK / LPK 文件。
        </p>
      )}
      {models.length > limit && (
        <button disabled={!!busy} onClick={() => setLimit(limit + 20)}>
          显示更多 · 还有 {models.length - limit} 个
        </button>
      )}
    </details>
  );
}
