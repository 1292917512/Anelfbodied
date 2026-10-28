import { useEffect, useState } from 'react';
import type { Snapshot } from '../../contracts/client';
import type { ConnectionOverview } from '../../contracts/connection';
import { ChannelGuide } from './ChannelGuide';

export function ConnectionForm({
  snapshot,
  run,
}: {
  snapshot: Snapshot;
  run(task: () => Promise<unknown>): void;
}) {
  const [baseline, setBaseline] = useState({
    settings: snapshot.settings,
    revision: snapshot.settingsRevision,
  });
  const [form, setForm] = useState({ ...snapshot.settings, token: '' });
  const [clearToken, setClearToken] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = Boolean(
    form.token ||
    clearToken ||
    (['baseUrl', 'userId', 'sessionId', 'skillName'] as const).some(
      (key) => form[key] !== baseline.settings[key],
    ),
  );
  const conflict = baseline.revision !== snapshot.settingsRevision;
  const pending = submitting || snapshot.connectionUpdating;
  const status = snapshot.connection.status;
  const connected = status === 'online' && !dirty;
  const load = (state: Pick<ConnectionOverview, 'settings' | 'revision'>) => {
    setBaseline(state);
    setForm({ ...state.settings, token: '' });
    setClearToken(false);
    setSaved(true);
  };
  useEffect(() => {
    if (!dirty && conflict)
      load({ settings: snapshot.settings, revision: snapshot.settingsRevision });
  }, [dirty, conflict, snapshot.settingsRevision, snapshot.settings]);
  const update = (key: 'baseUrl' | 'token' | 'userId' | 'sessionId' | 'skillName', value: string) =>
    setForm((previous) => ({ ...previous, [key]: value }));
  return (
    <section>
      <p className="settings-intro">
        把思考交给你的 Agent。
        <br />
        我负责在桌面回应你。
      </p>
      {conflict && dirty && !submitting && (
        <div className="configuration-conflict" role="status">
          <p>连接配置已由其他入口更新，请载入最新配置后再编辑。</p>
          <button
            onClick={() =>
              load({ settings: snapshot.settings, revision: snapshot.settingsRevision })
            }
          >
            载入最新配置
          </button>
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (pending) return;
          setSubmitting(true);
          run(async () => {
            try {
              const { baseUrl, token, userId, sessionId, skillName } = form;
              const result = await window.embodied.configure({
                baseUrl,
                token,
                userId,
                sessionId,
                skillName,
                clearToken,
                expectedRevision: baseline.revision,
              });
              load(result);
            } finally {
              setSubmitting(false);
            }
          });
        }}
      >
        <fieldset disabled={pending}>
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
          <label>
            技能名称（可选）
            <input
              aria-label="技能名称"
              value={form.skillName}
              onChange={(event) => update('skillName', event.target.value)}
              placeholder="anelfbodied-control"
              maxLength={64}
              pattern="[a-z0-9_](?:[a-z0-9_\-]*[a-z0-9_])?"
              autoCapitalize="none"
              spellCheck={false}
            />
          </label>
          <p className="hint">由 Anelf 加载指定技能及其 MCP 关联。消息正文只传话语，留空不指定。</p>
          <p className="hint">
            Token {snapshot.secureStorage ? '由系统加密保存' : '仅保留在本次运行内'}。
          </p>
        </fieldset>
        {!pending && (saved || dirty) && (
          <p className="hint" role="status">
            {dirty ? '有未保存的修改' : '配置已保存'}
          </p>
        )}
        {snapshot.connection.busy && (
          <p className="hint">回复进行中，请先停止当前会话再修改连接。</p>
        )}
        <div className="button-row">
          <button
            className="primary connection-submit"
            type="submit"
            aria-busy={pending}
            disabled={pending || snapshot.connection.busy || conflict || connected}
          >
            {pending
              ? status === 'syncing'
                ? '正在同步…'
                : '正在连接…'
              : connected
                ? '已连接'
                : !dirty && (status === 'error' || status === 'reconnecting')
                  ? '重试连接'
                  : '保存并连接'}
          </button>
          <button
            type="button"
            disabled={!pending && ['offline', 'error'].includes(status)}
            onClick={() => run(() => window.embodied.disconnect())}
          >
            {pending
              ? '取消连接'
              : status === 'reconnecting' || status === 'syncing'
                ? '停止重连'
                : '断开'}
          </button>
        </div>
      </form>
      <ChannelGuide snapshot={snapshot} blocked={pending || dirty || conflict} run={run} />
    </section>
  );
}
