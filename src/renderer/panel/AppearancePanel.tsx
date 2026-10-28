import type { Appearance } from '../../skins/schema';
import { SkinSprite } from '../components/SkinSprite';

export function AppearancePanel({
  appearance,
  run,
}: {
  appearance: Appearance;
  run: (task: () => Promise<unknown>) => void;
}) {
  const selected = appearance.skins.find((skin) => skin.id === appearance.skinId)!;
  return (
    <section className="appearance-view">
      <div className="skin-preview">
        <SkinSprite skin={selected} />
      </div>
      <h2>{selected.name}</h2>
      <p className="hint">
        {selected.author}
        {selected.license ? ` · ${selected.license}` : ''}
      </p>
      <label className="scale-label">
        桌宠大小 <span>{Math.round(appearance.scale * 100)}%</span>
        <input
          aria-label="桌宠大小"
          type="range"
          min="70"
          max="150"
          step="5"
          value={Math.round(appearance.scale * 100)}
          onChange={(event) =>
            run(() =>
              window.embodied.setAppearance({
                skinId: appearance.skinId,
                scale: Number(event.target.value) / 100,
              }),
            )
          }
        />
      </label>
      <div className="skin-list">
        {appearance.skins.map((skin) => (
          <button
            className={skin.id === appearance.skinId ? 'selected' : ''}
            key={skin.id}
            aria-pressed={skin.id === appearance.skinId}
            onClick={() =>
              run(() => window.embodied.setAppearance({ skinId: skin.id, scale: appearance.scale }))
            }
          >
            <span className="skin-thumbnail">
              <SkinSprite skin={skin} animate={false} />
            </span>
            <span>{skin.name}</span>
            <small>{skin.builtin ? '内置' : '已导入'}</small>
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
      <p className="hint">支持静态 PNG 和序列帧皮肤。导入后即可切换，不影响正在执行的动作。</p>
      <div className="button-row">
        <button onClick={() => run(() => window.embodied.openLocation('skins'))}>
          打开皮肤目录
        </button>
        <button onClick={() => run(() => window.embodied.openLocation('skin-guide'))}>
          皮肤开发说明
        </button>
      </div>
    </section>
  );
}
