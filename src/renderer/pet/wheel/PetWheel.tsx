import { useEffect, useRef } from 'react';
import { Icon } from '../../components/Icon';
import type { Point } from '../../../shared/geometry';
import type { PanelView } from '../../../contracts/client';
import './wheel.css';

export function PetWheel({
  position,
  busy,
  close,
  talk,
  touch,
  panel,
  stop,
}: {
  position: Point;
  busy: boolean;
  close(): void;
  talk(): void;
  touch(): void;
  panel(view: PanelView): void;
  stop(): void;
}) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    window.embodied.focusPet(true);
    root.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus({ preventScroll: true });
  }, []);
  const items = [
    { name: '和桌宠聊天', label: '聊聊', icon: 'chat', run: talk },
    { name: '更换形象', label: '形象', icon: 'skin', run: () => panel('appearance') },
    { name: '连接设置', label: '连接', icon: 'settings', run: () => panel('settings') },
    { name: '停止当前动作', label: '停止', icon: 'stop', run: stop, disabled: !busy },
    { name: '对话记录', label: '足迹', icon: 'history', run: () => panel('history') },
    { name: '摸摸桌宠', label: '摸摸', icon: 'touch', run: touch },
  ] as const;
  return (
    <div
      ref={root}
      className="pet-wheel"
      role="menu"
      aria-label="桌宠操作轮盘"
      style={{ left: position.x, top: position.y }}
      onKeyDown={(event) => {
        if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key))
          return;
        event.preventDefault();
        const buttons = [
          ...root.current!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not(:disabled)'),
        ];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
          event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : (index +
                  (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1) +
                  buttons.length) %
                buttons.length;
        buttons[next]?.focus();
      }}
    >
      <div className="wheel-orbit" aria-hidden="true" />
      {items.map((item, index) => {
        const angle = ((-90 + index * 60) * Math.PI) / 180;
        return (
          <button
            key={item.name}
            role="menuitem"
            aria-label={item.name}
            disabled={'disabled' in item && item.disabled}
            className={item.icon === 'stop' ? 'wheel-stop' : ''}
            style={{ left: 120 + Math.cos(angle) * 83, top: 120 + Math.sin(angle) * 83 }}
            onClick={() => {
              item.run();
              if (item.icon !== 'chat') close();
            }}
          >
            <Icon name={item.icon} />
            <span>{item.label}</span>
          </button>
        );
      })}
      <button className="wheel-close" aria-label="收起轮盘" onClick={close} title="收起 · Esc">
        <Icon name="close" />
      </button>
    </div>
  );
}
