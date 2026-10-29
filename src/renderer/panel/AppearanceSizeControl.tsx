import { useEffect, useId, useState } from 'react';
import { petSize } from '../../shared/pet-size';
import { petDisplaySize, type Size } from '../../shared/geometry';

export function AppearanceSizeControl({
  scale,
  viewport,
  change,
}: {
  scale: number;
  viewport: Size;
  change(scale: number): void;
}) {
  const percent = Math.round(scale * 100);
  const [draft, setDraft] = useState(String(percent));
  const inputId = useId();
  const min = petSize.minScale * 100,
    max = petSize.maxScale * 100;
  const { diameter, requested, limited } = petDisplaySize(viewport, scale);
  const value = Number(draft);
  const valid = draft.trim() !== '' && Number.isFinite(value) && value >= min && value <= max;
  useEffect(() => setDraft(String(percent)), [percent]);
  const apply = (value: number) => {
    setDraft(String(value));
    if (value !== percent) change(value / 100);
  };
  const commit = () => {
    if (valid) apply(Math.round(value));
  };
  return (
    <div className="appearance-size">
      <div className="size-heading">
        <label htmlFor={inputId}>桌宠大小</label>
        <div className="size-value">
          <input
            id={inputId}
            aria-label="桌宠大小百分比"
            type="number"
            inputMode="decimal"
            min={min}
            max={max}
            step="1"
            value={draft}
            aria-invalid={!valid}
            aria-describedby={`${inputId}-help`}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
              if (event.key === 'Escape') {
                setDraft(String(percent));
                event.preventDefault();
              }
            }}
          />
          <span>%</span>
        </div>
      </div>
      <input
        aria-label="桌宠大小"
        type="range"
        min={min}
        max={max}
        step="1"
        value={percent}
        onChange={(event) => apply(Number(event.target.value))}
      />
      <div className="size-presets">
        {[100, 200, 300, 500].map((value) => (
          <button
            key={value}
            aria-label={`设为 ${value}%`}
            aria-pressed={percent === value}
            onClick={() => apply(value)}
          >
            {value}%
          </button>
        ))}
      </div>
      <p id={`${inputId}-help`} className="hint" role="status">
        {!valid
          ? `请输入 ${min}–${max} 之间的数值，按回车应用。`
          : limited
            ? `当前屏幕适配为 ${Math.round(diameter)} 像素，保留 ${Math.round(requested)} 像素的尺寸设置。`
            : `桌面显示区域 ${Math.round(diameter)} × ${Math.round(diameter)} 像素；预览图保持固定大小。`}
      </p>
    </div>
  );
}
