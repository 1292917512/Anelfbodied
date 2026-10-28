import { useEffect, useState } from 'react';
import type { Motion, Skin } from '../../skins/schema';
import { defaultSkinImage } from '../../skins/builtin';

/** Renders a static image or a regular sprite grid without executing skin code. */
export function SkinSprite({
  skin,
  motion = 'idle',
  animate = true,
}: {
  skin?: Skin;
  motion?: Motion;
  animate?: boolean;
}) {
  const sprite = skin?.animations[motion] ?? skin?.animations.idle;
  const [frame, setFrame] = useState(0);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFrame(0);
    setFailed(false);
    if (
      !sprite ||
      !animate ||
      sprite.frames === 1 ||
      matchMedia('(prefers-reduced-motion: reduce)').matches
    )
      return;
    const start = performance.now();
    const timer = setInterval(
      () => setFrame(Math.floor(((performance.now() - start) * sprite.fps) / 1000) % sprite.frames),
      1000 / sprite.fps,
    );
    return () => clearInterval(timer);
  }, [sprite?.url, sprite?.frames, sprite?.fps, motion, animate]);
  if (!sprite || failed)
    return (
      <img className="skin-fallback" src={`./${defaultSkinImage}`} alt={skin?.name ?? '桌宠形象'} />
    );
  const columns = sprite.columns,
    rows = Math.ceil(sprite.frames / columns),
    ratio = sprite.width / sprite.height;
  const current = frame % sprite.frames;
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
