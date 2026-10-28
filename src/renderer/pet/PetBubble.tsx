import { useEffect, useRef, useState } from 'react';
import type { CompanionState } from '../../contracts/client';
import type { PetState } from './engine';
import { Icon } from '../components/Icon';
import { connectionLabels } from '../connection-state';

export function PetBubble({
  state,
  companion,
  open,
  close,
  answer,
  left,
  maxHeight,
  bottom,
}: {
  state: PetState;
  companion: CompanionState;
  open: boolean;
  close(): void;
  answer(text: string): void;
  left: number;
  maxHeight: number;
  bottom: number;
}) {
  const [draft, setDraft] = useState('');
  const [response, setResponse] = useState('');
  const [error, setError] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (!open || state.question) return;
    window.embodied.focusPet(true);
    const frame = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open, state.question]);
  useEffect(() => {
    setResponse('');
  }, [state.question]);
  const run = async (task: () => Promise<unknown>) => {
    setError('');
    try {
      await task();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
          : String(error),
      );
    }
  };
  const send = () => {
    if (!draft.trim() || companion.status !== 'online' || companion.busy) return;
    const text = draft;
    void run(async () => {
      await window.embodied.send(text);
      setDraft((previous) => (previous === text ? '' : previous));
      close();
    });
  };
  const thinking = companion.busy && !state.text && !state.question;
  if (!open && !state.text && !state.question && !thinking && !error) return null;
  return (
    <div
      className={`pet-bubble ${open ? 'typing' : ''}`}
      style={{ left, maxHeight, bottom }}
      role="status"
    >
      {(open || thinking || error) && (
        <div className="bubble-tools">
          <span>
            {thinking
              ? '想一想…'
              : companion.status === 'online'
                ? '我在听'
                : connectionLabels[companion.status]}
          </span>
          {(companion.busy || companion.active) && (
            <button
              className="icon-button"
              aria-label="停止当前动作"
              title="停止当前动作"
              onClick={() => void run(() => window.embodied.stop())}
            >
              <Icon name="stop" />
            </button>
          )}
          {open && (
            <button className="icon-button" aria-label="收起输入气泡" onClick={close}>
              <Icon name="close" />
            </button>
          )}
        </div>
      )}
      {(state.text || state.question) && (
        <p className="bubble-text">{state.text || state.question}</p>
      )}
      {thinking && companion.draft && (
        <p className="bubble-text draft">{companion.draft.slice(-500)}</p>
      )}
      {state.question ? (
        <>
          <div className="choices">
            {state.options.map((option, index) => (
              <button key={`${option}-${index}`} onClick={() => answer(option)}>
                {option}
              </button>
            ))}
          </div>
          <form
            className="bubble-answer"
            onSubmit={(event) => {
              event.preventDefault();
              answer(response);
            }}
          >
            <input
              aria-label="回答桌宠"
              placeholder="或者告诉我你的想法…"
              value={response}
              onChange={(event) => setResponse(event.target.value)}
              maxLength={4000}
            />
            <button type="submit" aria-label="确认回答">
              <Icon name="arrow" />
            </button>
          </form>
        </>
      ) : (
        open && (
          <>
            {companion.status !== 'online' && (
              <button
                className="bubble-connect"
                onClick={() => window.embodied.showPanel('settings')}
              >
                连接你的 AI ↗
              </button>
            )}
            <form
              className="bubble-compose"
              onSubmit={(event) => {
                event.preventDefault();
                send();
              }}
            >
              <textarea
                ref={input}
                rows={1}
                aria-label="发送消息"
                placeholder="说点什么…"
                maxLength={16000}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    send();
                  }
                }}
              />
              <button
                type="submit"
                aria-label="发送消息"
                disabled={!draft.trim() || companion.status !== 'online' || companion.busy}
              >
                <Icon name="arrow" />
              </button>
            </form>
          </>
        )
      )}
      {error && (
        <div className="bubble-error" role="alert">
          {error}
          <button className="icon-button" aria-label="关闭错误" onClick={() => setError('')}>
            <Icon name="close" />
          </button>
        </div>
      )}
      {open && companion.detail && <p className="bubble-note">{companion.detail}</p>}
    </div>
  );
}
