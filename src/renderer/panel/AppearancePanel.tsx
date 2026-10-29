import type { Appearance } from '../../model/schema';
import { SkinSprite } from '../components/SkinSprite';
import { useState } from 'react';
import { ModelView } from '../components/ModelView';
import type { ModelCapabilities } from '../../protocol/model';
import { ModelLibraryPanel } from './ModelLibraryPanel';
import { AppearanceSizeControl } from './AppearanceSizeControl';
import { BehaviorPanel } from './BehaviorPanel';
import type { BehaviorSettings } from '../../behavior/settings';
import type { Size } from '../../shared/geometry';

export function AppearancePanel({
  appearance,
  run,
  model,
  viewport,
  behaviors,
}: {
  appearance: Appearance;
  viewport: Size;
  model?: ModelCapabilities;
  behaviors: BehaviorSettings;
  run: (task: () => Promise<unknown>) => void;
}) {
  const selected = appearance.skins.find((skin) => skin.id === appearance.skinId)!;
  const [type, setType] = useState('all');
  return (
    <section className="appearance-view">
      <div className="appearance-hero">
        <div className="skin-preview">
          <ModelView
            skin={selected}
            revision={model?.revision ?? selected.id}
            behavior="idle"
            muted
          />
        </div>
        <div>
          <h2>{selected.name}</h2>
          <p className="hint">
            {appearance.types.find((type) => type.id === selected.type)?.name ?? selected.type} ·{' '}
            {selected.actions.length} 个动作
          </p>
          <span className={`model-status ${model?.status ?? 'loading'}`} role="status">
            {model?.status === 'ready'
              ? '已就绪'
              : model?.status === 'error'
                ? '加载失败'
                : '正在加载…'}
          </span>
        </div>
      </div>
      {model?.status === 'error' && (
        <div className="model-status error">
          <button onClick={() => run(() => window.embodied.reloadModel())}>重新加载</button>
          <details>
            <summary>查看原因</summary>
            <p>{model.detail}</p>
          </details>
        </div>
      )}
      <AppearanceSizeControl
        scale={appearance.scale}
        viewport={viewport}
        change={(scale) =>
          run(() => window.embodied.setAppearance({ skinId: appearance.skinId, scale }))
        }
      />
      <BehaviorPanel skin={selected} settings={behaviors} run={run} />
      <details className="disclosure skin-chooser">
        <summary>
          更换形象 <small>{appearance.skins.length} 个</small>
        </summary>
        <label className="model-type-filter">
          模型类型
          <select
            aria-label="模型类型"
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="all">全部类型</option>
            {appearance.types.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </label>
        <div className="skin-list">
          {appearance.skins
            .filter((skin) => type === 'all' || skin.type === type)
            .map((skin) => (
              <button
                className={skin.id === appearance.skinId ? 'selected' : ''}
                key={skin.id}
                aria-pressed={skin.id === appearance.skinId}
                onClick={() =>
                  run(() =>
                    window.embodied.setAppearance({ skinId: skin.id, scale: appearance.scale }),
                  )
                }
              >
                <span className="skin-thumbnail">
                  <SkinSprite skin={skin} />
                </span>
                <span>{skin.name}</span>
                <small>{skin.builtin ? '内置' : skin.linked ? '引用' : '已导入'}</small>
              </button>
            ))}
        </div>
        <div className="button-row">
          <button className="primary" onClick={() => run(() => window.embodied.importSkin())}>
            导入皮肤文件夹
          </button>
          {!selected.builtin && (
            <button onClick={() => run(() => window.embodied.removeSkin(selected.id))}>
              移除皮肤
            </button>
          )}
        </div>
      </details>
      <details className="disclosure model-actions">
        <summary>
          预览动作 <small>{selected.actions.length} 个</small>
        </summary>
        <div className="model-action-list">
          {selected.actions.map((action) => (
            <button
              key={action.name}
              disabled={model?.status !== 'ready'}
              title={action.description}
              onClick={() => run(() => window.embodied.previewAction(action.name))}
            >
              <span>
                {action.description || action.name}
                <small className="action-name">{action.name}</small>
              </span>
              <small>{(action.durationMs / 1000).toFixed(1)} 秒</small>
            </button>
          ))}
        </div>
      </details>
      <ModelLibraryPanel />
      <details className="disclosure">
        <summary>资源与开发</summary>
        <p className="hint">
          {selected.author}
          {selected.license ? ` · ${selected.license}` : ''}
        </p>
        {selected.notices?.map((notice) => (
          <p key={notice} className="hint">
            {notice}
          </p>
        ))}
        <p className="hint">支持 PNG、序列帧与 Live2D Cubism 3+；切换形象会停止旧模型动作。</p>
        <div className="button-row">
          <button onClick={() => run(() => window.embodied.openLocation('skins'))}>
            打开皮肤目录
          </button>
          <button onClick={() => run(() => window.embodied.openLocation('skin-guide'))}>
            皮肤开发说明
          </button>
        </div>
      </details>
    </section>
  );
}
