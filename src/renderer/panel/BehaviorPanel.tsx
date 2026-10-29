import type { Skin } from '../../model/schema';
import type { BehaviorSettings } from '../../behavior/settings';

export function BehaviorPanel({
  skin,
  settings,
  run,
}: {
  skin: Skin;
  settings: BehaviorSettings;
  run(task: () => Promise<unknown>): void;
}) {
  return (
    <details className="disclosure behavior-settings">
      <summary>
        交互与行为 <small>{Object.keys(settings.overrides).length ? '已自定义' : '跟随皮肤'}</small>
      </summary>
      <p className="hint">给行为选择动作，仅对当前形象生效。没有对应动作时使用轻量反馈。</p>
      <div className="behavior-mappings">
        {settings.presets.map((preset) => {
          const override = settings.overrides[preset.id];
          const missing = Boolean(
            override && !skin.actions.some((action) => action.name === override),
          );
          const defaultAction = settings.defaults[preset.id];
          return (
            <label key={preset.id} title={preset.description}>
              <span>
                {preset.name}
                <small>{preset.description}</small>
              </span>
              <select
                aria-label={`${preset.name}动作`}
                value={override === undefined ? 'default' : JSON.stringify(override)}
                onChange={(event) =>
                  run(() =>
                    window.embodied.setBehaviors({
                      skinId: skin.id,
                      patch: {
                        [preset.id]:
                          event.target.value === 'default' ? null : JSON.parse(event.target.value),
                      },
                    }),
                  )
                }
              >
                <option value="default">
                  {defaultAction
                    ? `皮肤默认 · ${skin.actions.find((item) => item.name === defaultAction)?.description || defaultAction}`
                    : '自动反馈'}
                </option>
                <option value={'""'}>不播放反馈</option>
                {missing && (
                  <option disabled value={JSON.stringify(override)}>
                    原动作已移除（使用默认）
                  </option>
                )}
                {skin.actions.map((action) => (
                  <option key={action.name} value={JSON.stringify(action.name)}>
                    {action.description || action.name}
                  </option>
                ))}
              </select>
            </label>
          );
        })}
      </div>
      {Object.keys(settings.overrides).length > 0 && (
        <button
          className="text-button"
          onClick={() =>
            run(() =>
              window.embodied.setBehaviors({
                skinId: skin.id,
                patch: Object.fromEntries(
                  settings.presets
                    .filter((entry) => entry.id in settings.overrides)
                    .map((entry) => [entry.id, null]),
                ),
              }),
            )
          }
        >
          恢复此形象的默认行为
        </button>
      )}
    </details>
  );
}
