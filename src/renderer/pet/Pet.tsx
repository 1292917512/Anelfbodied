import { useEffect, useRef, useState } from 'react';
import { PetEngine, type PetState } from './engine';
import {
  bubblePlacement,
  fullModelBounds,
  normalizePet,
  petAnchor,
  petDisplaySize,
  visibleModelBounds,
  type Bounds,
} from '../../shared/geometry';
import type { CompanionState, PanelView } from '../../contracts/client';
import { usePetGestures } from './usePetGestures';
import { usePointerRegions } from './usePointerRegions';
import { useBehavior } from './useBehavior';
import { PetBubble } from './PetBubble';
import { PetWheel } from './wheel/PetWheel';
import { wheelPosition } from './wheel/layout';
import { SkinSprite } from '../components/SkinSprite';
import { ModelView } from '../components/ModelView';
import type { ModelSession } from '../../model/session';

export function Pet() {
  const [state, setState] = useState<PetState>({
    x: 0.78,
    y: 0.75,
    bounds: fullModelBounds,
    face: 'neutral',
    text: '',
    question: '',
    options: [],
    moving: false,
    performing: false,
  });
  const [companion, setCompanion] = useState<CompanionState>({
    status: 'offline',
    detail: '',
    draft: '',
    busy: false,
    active: false,
  });
  const [typing, setTyping] = useState(false);
  const [wheel, setWheel] = useState(false);
  const [controlBounds, setControlBounds] = useState<Bounds>(fullModelBounds);
  const [dragging, setDragging] = useState(false);
  const [notice, setNotice] = useState('');
  const [size, setSize] = useState({ width: innerWidth, height: innerHeight });
  const engine = useRef<PetEngine | null>(null);
  const model = useRef<ModelSession | undefined>(undefined);
  const pointer = usePointerRegions(() => model.current?.hitMask());
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const scale = companion.appearance?.scale ?? 1;
  const skin = companion.appearance?.skin;
  const { diameter } = petDisplaySize(size, scale);
  const placementContext = useRef({ size, scale });
  placementContext.current = { size, scale };
  const behavior = useBehavior(
    skin,
    [
      ...(dragging ? ['drag'] : []),
      ...(state.moving ? ['move'] : []),
      ...(state.text || state.question || companion.draft ? ['talk'] : []),
      state.face,
    ],
    state.performing,
  );
  const close = () => {
    setTyping(false);
    setWheel(false);
    window.embodied.focusPet(false);
  };
  const measureControls = () => {
    const bounds = pointer.bounds();
    setControlBounds(bounds);
    return bounds;
  };
  const talk = () => {
    setWheel(false);
    setNotice('');
    if (typing) close();
    else {
      measureControls();
      setTyping(true);
    }
  };
  const touch = () => {
    behavior.trigger('touch');
  };
  const toggleWheel = () => {
    if (wheel) close();
    else {
      measureControls();
      setTyping(false);
      setWheel(true);
    }
  };
  const gestures = usePetGestures({
    hitTest: pointer.hitTest,
    bounds: pointer.bounds,
    menu: () => {
      touch();
      toggleWheel();
    },
    touch,
    talk,
    dragging: (active, cancelled) => {
      setDragging(active);
      if (active) {
        behavior.clear();
        setTyping(false);
        setWheel(false);
      } else if (!cancelled) behavior.trigger('drop');
    },
    move: (placement) => {
      setControlBounds(placement.bounds);
      engine.current?.move(placement);
    },
  });
  useEffect(() => {
    const runtime = new PetEngine(
      setState,
      (id, result) => window.embodied.answer(id, result),
      (action, signal) =>
        model.current?.execute(action, signal) ??
        Promise.resolve({ outcome: 'failed', detail: 'Model is loading' }),
    );
    engine.current = runtime;
    const resize = () => setSize({ width: innerWidth, height: innerHeight });
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    const blur = () => {
      setTyping(false);
      setWheel(false);
    };
    window.addEventListener('resize', resize);
    window.addEventListener('keydown', escape);
    window.addEventListener('blur', blur);
    const off = window.embodied.onOrder((order) => {
      if (order.type === 'execute') {
        const bounds = pointer.bounds();
        setControlBounds(bounds);
        if (order.action.action === 'move') {
          const { size, scale } = placementContext.current;
          const anchor = petAnchor(size, runtime.state, scale, runtime.state.bounds);
          runtime.place(normalizePet(size, anchor, scale, bounds));
        }
      }
      runtime.dispatch(order);
    });
    const offState = window.embodied.onCompanion(setCompanion);
    void window.embodied.companion().then(setCompanion);
    window.embodied.ready();
    return () => {
      window.removeEventListener('resize', resize);
      window.removeEventListener('keydown', escape);
      window.removeEventListener('blur', blur);
      clearTimeout(noticeTimer.current);
      off();
      offState();
      runtime.dispose();
    };
  }, []);
  useEffect(() => {
    setControlBounds(fullModelBounds);
    const runtime = engine.current;
    if (runtime) runtime.place({ x: runtime.state.x, y: runtime.state.y, bounds: fullModelBounds });
  }, [companion.appearance?.revision]);
  useEffect(() => {
    if (companion.busy) setControlBounds(pointer.bounds());
  }, [companion.busy]);
  useEffect(() => {
    const timer = setTimeout(
      () => window.embodied.position({ x: state.x, y: state.y, bounds: state.bounds }),
      100,
    );
    return () => clearTimeout(timer);
  }, [state.x, state.y, state.bounds]);
  const { x, y } = petAnchor(size, state, scale, state.bounds);
  const visible = visibleModelBounds({ x, y }, diameter, controlBounds);
  const openPanel = (view: PanelView) => {
    const bounds = measureControls();
    setWheel(false);
    const current = engine.current?.state ?? state;
    const anchor = petAnchor(size, current, scale, current.bounds);
    window.embodied.position(normalizePet(size, anchor, scale, bounds));
    window.embodied.showPanel(view);
  };
  return (
    <div className="pet-stage" ref={pointer.anchor}>
      <div
        className="pet-anchor"
        style={{ left: x, top: y, width: diameter, height: diameter }}
        data-behavior={behavior.id}
      >
        <PetBubble
          state={state}
          companion={companion}
          open={typing}
          close={close}
          answer={(text) => engine.current?.answer(text)}
          connect={() => openPanel('settings')}
          placement={bubblePlacement(size, visible, { x, y, width: diameter, height: diameter })}
        />
        {notice && (
          <div
            className="pet-touch-note"
            role="status"
            style={{
              top: Math.max(8, visible.y - 40) - y,
              left: Math.max(92, Math.min(size.width - 92, visible.x + visible.width / 2)) - x,
            }}
          >
            {notice}
          </div>
        )}
        {behavior.mark && (
          <span
            key={behavior.sequence + behavior.id}
            className="behavior-mark"
            aria-hidden="true"
            style={{
              left: Math.max(8, Math.min(size.width - 28, visible.x + visible.width * 0.85)) - x,
              top: Math.max(8, visible.y - 24) - y,
            }}
          >
            {behavior.mark}
          </span>
        )}
        <button
          aria-label="桌宠，单击打开轮盘，双击聊天"
          title="单击轮盘 · 双击聊天 · 拖动移动 · 抚摸头部"
          className={`pet-body ${gestures.pressed ? 'pressed' : ''}`}
          style={{ width: diameter, height: diameter }}
          {...gestures.handlers}
          onContextMenu={(event) => {
            event.preventDefault();
            if (pointer.hitTest(event.clientX, event.clientY)) toggleWheel();
          }}
        >
          <span className="skin-look" style={{ rotate: `${dragging ? 0 : gestures.look * 2}deg` }}>
            <span className="skin-frame" ref={behavior.frame}>
              {skin && companion.appearance ? (
                <ModelView
                  skin={skin}
                  revision={companion.appearance.revision}
                  behavior={behavior.id}
                  sequence={behavior.sequence}
                  session={(session) => {
                    model.current = session;
                  }}
                  status={(status, detail) =>
                    window.embodied.modelStatus({
                      revision: companion.appearance!.revision,
                      status,
                      detail,
                    })
                  }
                />
              ) : (
                <SkinSprite />
              )}
            </span>
          </span>
        </button>
      </div>
      {wheel && (
        <PetWheel
          position={wheelPosition(size, visible)}
          busy={companion.active || companion.busy}
          close={() => {
            setWheel(false);
            window.embodied.focusPet(false);
          }}
          talk={talk}
          touch={touch}
          panel={openPanel}
          stop={() =>
            void window.embodied.stop().catch(() => {
              setNotice('停止未确认，请检查连接');
              clearTimeout(noticeTimer.current);
              noticeTimer.current = setTimeout(() => setNotice(''), 4000);
            })
          }
        />
      )}
    </div>
  );
}
