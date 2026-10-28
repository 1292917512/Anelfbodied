import { useEffect, useState } from 'react';
import type { Snapshot, PanelView } from '../../host/contracts';
import { PROTOCOL } from '../../protocol/schema';
import { SettingsPanel } from './SettingsPanel';
import { Receipts } from './Receipts';
import { Icon } from '../components/Icon';
import { AppearancePanel } from './AppearancePanel';
import { SkinSprite } from '../components/SkinSprite';

function messageText(text: string): string {
  try {
    const data = JSON.parse(text) as {
      protocol?: string;
      commands?: { text?: string; question?: string; action: string }[];
    };
    if (data.protocol === PROTOCOL)
      return (
        data.commands
          ?.map((action) => action.text ?? action.question ?? `〈${action.action}〉`)
          .join('\n') ?? text
      );
  } catch {
    /* Display ordinary replies as text. */
  }
  return text.split('[桌宠客户端接入]')[0]?.trim() ?? text;
}
const labels = {
  offline: '未连接',
  connecting: '连接中',
  online: '已连接',
  reconnecting: '重连中',
  error: '连接异常',
};
export function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [view, setView] = useState<PanelView>('settings');
  const [error, setError] = useState('');
  useEffect(() => {
    void window.embodied
      .snapshot()
      .then(setSnapshot)
      .catch((error) => setError(String(error)));
    const off = window.embodied.onState(setSnapshot);
    const offView = window.embodied.onView(setView);
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') window.embodied.hidePanel();
    };
    window.addEventListener('keydown', escape);
    return () => {
      off();
      offView();
      window.removeEventListener('keydown', escape);
    };
  }, []);
  const run = (task: () => Promise<unknown>) => {
    setError('');
    void task().catch((error) =>
      setError(
        error instanceof Error
          ? error.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
          : String(error),
      ),
    );
  };
  if (!snapshot) return <main className="floating-shell loading">{error || '正在唤醒…'}</main>;
  return (
    <div className="floating-shell">
      <header className="float-header">
        <div className="companion-identity">
          <span className="header-skin">
            <SkinSprite
              skin={snapshot.appearance.skins.find(
                (skin) => skin.id === snapshot.appearance.skinId,
              )}
              animate={false}
            />
          </span>
          <div>
            <strong>embodied</strong>
            <span className={`connection ${snapshot.connection.status}`}>
              <i />
              {labels[snapshot.connection.status]}
            </span>
          </div>
        </div>
        <div className="window-actions">
          <button
            className={`icon-button ${view === 'history' ? 'selected' : ''}`}
            aria-label="对话记录"
            title="对话记录"
            onClick={() => setView('history')}
          >
            <Icon name="chat" />
          </button>
          <button
            className={`icon-button ${view === 'receipts' ? 'selected' : ''}`}
            aria-label="执行回执"
            title="执行回执"
            onClick={() => setView('receipts')}
          >
            <Icon name="history" />
          </button>
          <button
            className={`icon-button ${view === 'settings' ? 'selected' : ''}`}
            aria-label="连接设置"
            title="连接设置"
            onClick={() => setView('settings')}
          >
            <Icon name="settings" />
          </button>
          <button
            className={`icon-button ${view === 'appearance' ? 'selected' : ''}`}
            aria-label="更换形象"
            title="更换形象"
            onClick={() => setView('appearance')}
          >
            <Icon name="skin" />
          </button>
          <button
            className="icon-button"
            aria-label="收起浮层"
            title="收起 · Esc"
            onClick={() => window.embodied.hidePanel()}
          >
            <Icon name="close" />
          </button>
        </div>
      </header>
      <div className="view-heading">
        <h1>
          {view === 'settings'
            ? '连接'
            : view === 'history'
              ? '对话记录'
              : view === 'appearance'
                ? '我的形象'
                : '动作足迹'}
        </h1>
        <span>说话时，双击桌宠就好</span>
      </div>
      {error && (
        <div role="alert" className="alert">
          <span>{error}</span>
          <button className="icon-button" onClick={() => setError('')} aria-label="关闭错误">
            <Icon name="close" />
          </button>
        </div>
      )}
      {snapshot.connection.detail && (
        <div className="connection-detail" role="status">
          {snapshot.connection.detail}
        </div>
      )}
      <div className="detail-scroll">
        {view === 'appearance' ? (
          <AppearancePanel appearance={snapshot.appearance} run={run} />
        ) : view === 'settings' ? (
          <SettingsPanel snapshot={snapshot} run={run} />
        ) : view === 'receipts' ? (
          <Receipts
            receipts={snapshot.receipts}
            reportableIds={snapshot.reportableIds}
            report={(id) => run(() => window.embodied.report(id))}
          />
        ) : (
          <div className="history-view">
            {!snapshot.connection.messages.length && (
              <p className="empty">还没有对话。双击桌宠，说点什么吧。</p>
            )}
            {snapshot.connection.messages.map((line) => (
              <div
                className={`message ${line.role === 'user' ? 'user' : 'assistant'}`}
                key={line.id}
              >
                <small>{line.role === 'user' ? '你' : '伙伴'}</small>
                <p>{messageText(line.text)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
