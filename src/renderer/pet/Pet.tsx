import { useEffect, useRef, useState } from 'react';
import { PetEngine, type PetState } from './engine';
import { petAnchor } from '../../shared/geometry';
import type { CompanionState } from '../../host/contracts';
import { usePetGestures } from './usePetGestures';
import { usePointerRegions } from './usePointerRegions';
import { PetBubble } from './PetBubble';
import { Icon } from '../components/Icon';
import { SkinSprite } from '../components/SkinSprite';
import type { Motion } from '../../skins/schema';

const faces: Record<string, string> = {
  happy: '✦',
  thinking: '···',
  sleepy: 'Zz',
  surprised: '!',
  neutral: '',
};
const greetings = ['嗯？我在呀', '收到你的摸摸了', '双击，和我聊聊'];
export function Pet() {
  const [state, setState] = useState<PetState>({
    x: 0.78,
    y: 0.75,
    face: 'neutral',
    text: '',
    question: '',
    options: [],
    moving: false,
  });
  const [companion, setCompanion] = useState<CompanionState>({
    status: 'offline',
    detail: '',
    draft: '',
    busy: false,
    active: false,
  });
  const [typing, setTyping] = useState(false);
  const [pat, setPat] = useState(0);
  const [notice, setNotice] = useState('');
  const [size, setSize] = useState({ width: innerWidth, height: innerHeight });
  const engine = useRef<PetEngine | null>(null);
  const pointer = usePointerRegions();
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touches = useRef(0);
  const close = () => {
    setTyping(false);
    if (!gestures.drag.current) {
      window.embodied.focusPet(false);
    }
  };
  const scale = companion.appearance?.scale ?? 1;
  const diameter = 140 * scale;
  const skin = companion.appearance?.skin;
  const motion: Motion =
    pat && skin?.animations.touch
      ? 'touch'
      : state.moving
        ? 'move'
        : state.text || state.question
          ? 'talk'
          : state.face === 'neutral'
            ? 'idle'
            : state.face;
  const gestures = usePetGestures(
    {
      pat: () => {
        clearTimeout(feedbackTimer.current);
        const count = ++touches.current;
        setPat(count);
        setNotice(greetings[(count - 1) % greetings.length]!);
        feedbackTimer.current = setTimeout(() => {
          setPat(0);
          setNotice('');
        }, 1600);
      },
      talk: () => {
        setNotice('');
        if (typing) close();
        else setTyping(true);
      },
      move: (x, y) => {
        if (typing) close();
        engine.current?.move(x, y);
      },
    },
    scale,
  );
  useEffect(() => {
    const runtime = new PetEngine(setState, (id, result) => {
      window.embodied.answer(id, result);
    });
    engine.current = runtime;
    const resize = () => setSize({ width: innerWidth, height: innerHeight });
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const blur = () => setTyping(false);
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', escape);
    window.addEventListener('blur', blur);
    const off = window.embodied.onOrder((order) => runtime.dispatch(order));
    const offState = window.embodied.onCompanion(setCompanion);
    void window.embodied.companion().then(setCompanion);
    window.embodied.ready();
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('blur', blur);
      clearTimeout(feedbackTimer.current);
      off();
      offState();
      runtime.dispose();
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => window.embodied.position({ x: state.x, y: state.y }), 100);
    return () => clearTimeout(timer);
  }, [state.x, state.y]);
  const { x, y } = petAnchor(size, state, scale);
  const bubbleLeft = Math.max(12, Math.min(size.width - 282, x + diameter / 2 - 135)) - x;
  const toolsWidth = companion.active || companion.busy ? 163 : 132;
  const toolsLeft =
    Math.max(12, Math.min(size.width - toolsWidth - 12, x + diameter / 2 - toolsWidth / 2)) - x;
  const openPanel = (view: 'settings' | 'history' | 'appearance') => {
    window.embodied.position({ x: state.x, y: state.y });
    window.embodied.showPanel(view);
  };
  return (
    <div className="pet-stage">
      <div
        className={`pet-anchor ${state.moving ? 'walking' : ''} ${typing ? 'is-typing' : ''} ${pointer.hovered ? 'is-hovered' : ''}`}
        ref={pointer.anchor}
        style={{ left: x, top: y, width: diameter, height: diameter + 42 }}
      >
        <PetBubble
          state={state}
          companion={companion}
          open={typing}
          close={close}
          answer={(text) => engine.current?.answer(text)}
          left={bubbleLeft}
          maxHeight={Math.max(100, y - 22)}
          bottom={diameter + 52}
        />
        {!typing && !state.text && !state.question && !companion.busy && notice && (
          <div className="pet-touch-note" role="status" style={{ bottom: diameter + 46 }}>
            {notice}
          </div>
        )}
        <span className={`emotion ${state.face}`}>{faces[state.face]}</span>
        {pat > 0 && (
          <div key={pat} className="pet-sparks" aria-hidden="true">
            <i>✦</i>
            <i>♡</i>
            <i>✧</i>
          </div>
        )}
        <button
          aria-label="摸摸桌宠，双击输入消息"
          title="单击摸摸 · 双击说话 · 拖动移动"
          className={`pet-body ${state.face} ${gestures.pressed ? 'pressed' : ''}`}
          style={{ width: diameter, height: diameter }}
          data-animated={Boolean(
            skin?.animations[motion] && (motion !== 'idle' || skin.animations.idle.frames > 1),
          )}
          {...gestures.handlers}
          onContextMenu={(event) => {
            event.preventDefault();
            openPanel('settings');
          }}
        >
          <span
            key={pat}
            className={`skin-frame ${pat ? 'patted' : ''}`}
            style={{ rotate: `${gestures.look * 4}deg` }}
          >
            <SkinSprite skin={skin} motion={motion} />
          </span>
        </button>
        <div
          className="pet-tools"
          style={{ top: diameter + 5, left: toolsLeft, translate: 'none' }}
        >
          <button
            aria-label="和桌宠聊天"
            title="和我说话"
            onClick={() => {
              if (typing) close();
              else setTyping(true);
            }}
          >
            <Icon name="chat" />
          </button>
          <button aria-label="对话记录" title="对话记录" onClick={() => openPanel('history')}>
            <Icon name="history" />
          </button>
          <button aria-label="连接设置" title="连接设置" onClick={() => openPanel('settings')}>
            <Icon name="settings" />
          </button>
          <button aria-label="更换形象" title="更换形象" onClick={() => openPanel('appearance')}>
            <Icon name="skin" />
          </button>
          {(companion.active || companion.busy) && (
            <button
              aria-label="停止当前动作"
              title="停止当前动作"
              className="pet-stop"
              onClick={() =>
                void window.embodied.stop().catch(() => setNotice('停止未确认，请检查连接'))
              }
            >
              <Icon name="stop" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
