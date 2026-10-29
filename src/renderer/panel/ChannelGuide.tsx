import type { Snapshot } from '../../contracts/client';
import { channelGuide } from '../../integrations/anelf/guide';

export function ChannelGuide({
  snapshot,
  blocked,
  run,
}: {
  snapshot: Snapshot;
  blocked: boolean;
  run(task: () => Promise<unknown>): void;
}) {
  const ready = !blocked && snapshot.connection.status === 'online' && !snapshot.connection.busy;
  const message = channelGuide(snapshot.settings.skillName, {
    url: snapshot.apiUrl,
    token: snapshot.apiToken,
  });
  const start = snapshot.connection.messages.findLastIndex(
    (line) => line.role === 'user' && line.text === message,
  );
  const following = start < 0 ? [] : snapshot.connection.messages.slice(start + 1);
  const nextUser = following.findIndex((line) => line.role === 'user');
  const replies = following
    .slice(0, nextUser < 0 ? undefined : nextUser)
    .filter((line) => line.role === 'assistant');
  const waiting = start >= 0 && nextUser < 0 && snapshot.connection.busy;
  return (
    <section className="channel-guide">
      <div className="guide-actions">
        <button
          type="button"
          disabled={!ready}
          onClick={() => run(() => window.embodied.sendGuide())}
        >
          让 AI 安装技能
        </button>
        <span className="hint">按需安装与绑定 MCP</span>
      </div>
      <p className="hint">包含 MCP 连接凭据，可展开预览。不会自动发送。</p>
      <details>
        <summary>
          说明与安装进度{' '}
          {start >= 0 && (
            <span className="guide-status">
              · {waiting ? '等待结果' : replies.length ? '收到回复' : '暂无结果'}
            </span>
          )}
        </summary>
        <div className="guide-progress" role="status">
          {start >= 0 && (
            <p className="hint">
              {waiting
                ? '正在等待 Agent 回复安装结果。'
                : replies.length
                  ? 'Agent 回复'
                  : '请求已记录，尚未收到安装结果，请核对会话状态。'}
            </p>
          )}
          {replies.map((line) => (
            <p className="guide-reply" key={line.id}>
              {line.text}
            </p>
          ))}
        </div>
        <p className="hint">
          发往 {snapshot.settings.baseUrl}。以下内容包含本机实际端口与控制 Token，将进入该 Anelf
          的会话记录。
        </p>
        <pre className="guide-preview">{message}</pre>
      </details>
    </section>
  );
}
