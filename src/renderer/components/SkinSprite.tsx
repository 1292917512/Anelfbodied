import { useState } from 'react';
import type { Skin } from '../../model/schema';
import { defaultSkinImage } from '../../skins/builtin';

/** Renders a static image or a regular sprite grid without executing skin code. */
export function SkinSprite({ skin }: { skin?: Skin }) {
  const sprite = skin?.preview;
  const [failed, setFailed] = useState(false);
  if (skin && !sprite) return <span className="model-type-mark">{skin.type}</span>;
  if (!sprite || failed)
    return (
      <img className="skin-fallback" src={`./${defaultSkinImage}`} alt={skin?.name ?? '桌宠形象'} />
    );
  const columns = sprite.columns,
    rows = Math.ceil(sprite.frames / columns),
    ratio = sprite.width / sprite.height;
  const current = 0;
  return (
    <span
      className="sprite-viewport"
      style={{
        width: ratio >= 1 ? '100%' : `${ratio * 100}%`,
        height: ratio >= 1 ? `${100 / ratio}%` : '100%',
      }}
    >
      <img
        className="sprite-sheet"
        alt={skin!.name}
        src={sprite.url}
        onError={() => setFailed(true)}
        draggable={false}
        style={{
          width: `${columns * 100}%`,
          height: `${rows * 100}%`,
          transform: `translate(${(-100 * (current % columns)) / columns}%, ${(-100 * Math.floor(current / columns)) / rows}%)`,
        }}
      />
    </span>
  );
}
