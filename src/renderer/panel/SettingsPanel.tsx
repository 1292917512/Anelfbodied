import { useState } from 'react';
import type { Snapshot } from '../../host/contracts';

export function SettingsPanel({
  snapshot,
  run,
}: {
  snapshot: Snapshot;
  run: (task: () => Promise<unknown>) => void;
}) {
  const [form, setForm] = useState({ ...snapshot.settings, token: '' });
  const [source, setSource] = useState<'anelf' | 'mcp'>('anelf');
  const [reveal, setReveal] = useState(false);
  const [clearToken, setClearToken] = useState(false);
  const update = (key: 'baseUrl' | 'token' | 'userId' | 'sessionId', value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  return (
    <div className="settings-view">
      <div className="segmented" aria-label="连接方式">
        <button className={source === 'anelf' ? 'selected' : ''} onClick={() => setSource('anelf')}>
          Anelf 频道
        </button>
        <button className={source === 'mcp' ? 'selected' : ''} onClick={() => setSource('mcp')}>
          MCP / 消息协议
        </button>
      </div>
      {source === 'anelf' ? (
        <section>
          <p className="settings-intro">
            把思考交给你的 Agent。
            <br />
            我负责在桌面回应你。
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              run(async () => {
                const { baseUrl, token, userId, sessionId } = form;
                await window.embodied.configure({ baseUrl, token, userId, sessionId, clearToken });
                setForm((previous) => ({ ...previous, token: '' }));
                setClearToken(false);
                await window.embodied.connect();
              });
            }}
          >
            <label>
              频道地址
              <input
                aria-label="频道地址"
                value={form.baseUrl}
                onChange={(event) => update('baseUrl', event.target.value)}
                placeholder="https://agent.example.com"
                required
              />
            </label>
            <p className="hint">填写 HTTP API 频道地址，而非 WebUI。</p>
            <label>
              API Token
              <input
                aria-label="API Token"
                type="password"
                autoComplete="off"
                value={form.token}
                onChange={(event) => update('token', event.target.value)}
                placeholder={
                  snapshot.settings.hasToken ? '已保存，留空保留' : '频道配置中的 api_token'
                }
              />
            </label>
            {snapshot.settings.hasToken && (
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={clearToken}
                  onChange={(event) => setClearToken(event.target.checked)}
                />
                清除已保存的 Token
              </label>
            )}
            <div className="form-row">
              <label>
                用户标识
                <input
                  aria-label="用户标识"
                  value={form.userId}
                  onChange={(event) => update('userId', event.target.value)}
                  required
                />
              </label>
              <label>
                会话标识
                <input
                  aria-label="会话标识"
                  value={form.sessionId}
                  onChange={(event) => update('sessionId', event.target.value)}
                  required
                />
              </label>
            </div>
            <p className="hint">
              Token {snapshot.secureStorage ? '由系统加密保存' : '仅保留在本次运行内'}。
            </p>
            <div className="button-row">
              <button className="primary" type="submit">
                保存并连接
              </button>
              <button type="button" onClick={() => run(() => window.embodied.disconnect())}>
                断开
              </button>
            </div>
          </form>
        </section>
      ) : (
        <section>
          <p className="settings-intro">
            给任何支持协议的 AI，
            <br />
            同一个桌面伙伴。
          </p>
          <label>
            本机 MCP 地址
            <input aria-label="本机 MCP 地址" readOnly value={`${snapshot.apiUrl}/mcp`} />
          </label>
          <label>
            控制 Token
            <div className="secret">
              <input type={reveal ? 'text' : 'password'} readOnly value={snapshot.apiToken} />
              <button onClick={() => setReveal(!reveal)}>{reveal ? '隐藏' : '显示'}</button>
            </div>
          </label>
          <p className="hint">认证头：Authorization: Bearer &lt;Token&gt;。仅允许本机访问。</p>
          <div className="endpoint">
            <span>POST</span>
            <code>/v1/commands</code>
          </div>
          <div className="endpoint">
            <span>GET</span>
            <code>/v1/receipts/:id</code>
          </div>
          <div className="endpoint">
            <span>POST</span>
            <code>/v1/cancel</code>
          </div>
          <p className="hint">
            消息协议和 MCP 共用控制逻辑。完整协议与 stdio 接入方式见项目 README。
          </p>
        </section>
      )}
      <p className="version-note">Embodied 0.1 · 独立桌面伙伴</p>
    </div>
  );
}
