import { useEffect, useState } from 'react';
import type { Snapshot } from '../../contracts/client';
import { channelGuide, defaultSkillName } from '../../integrations/anelf/guide';

export function ChannelGuide({
  snapshot,
  blocked,
  run,
}: {
  snapshot: Snapshot;
  blocked: boolean;
  run(task: () => Promise<unknown>): void;
}) {
  const [sent, setSent] = useState(false);
  useEffect(() => setSent(false), [snapshot.settingsRevision]);
  const ready =
    !blocked &&
    snapshot.connection.status === 'online' &&
    !snapshot.connection.busy &&
    Boolean(snapshot.settings.skillName);
  const message = channelGuide(snapshot.settings.skillName || defaultSkillName, {
    url: snapshot.apiUrl,
    token: snapshot.apiToken,
  });
  return (
    <section className="channel-guide">
      <h3>让 Agent 准备桌宠技能</h3>
      <p className="hint">
        按需发送一次：缺少 Skill 时安装，已有时核对，并通过工具关联桌宠
        MCP。连接和重连都不会自动发送。
      </p>
      <p className="hint">
        包含本机 MCP 地址、实际端口和控制 Token，会发送至 {snapshot.settings.baseUrl} 并进入该 Anelf
        的会话记录。
      </p>
      <details>
        <summary>查看将发送的说明与 MCP 配置</summary>
        <pre className="guide-preview">{message}</pre>
      </details>
      {!snapshot.settings.skillName && (
        <p className="hint">请先填写并保存技能名称，可使用 {defaultSkillName}。</p>
      )}
      <button
        type="button"
        disabled={!ready}
        onClick={() =>
          run(async () => {
            setSent(false);
            await window.embodied.sendGuide();
            setSent(true);
          })
        }
      >
        发送接入说明
      </button>
      {sent && (
        <p className="hint" role="status">
          说明已发送，安装与绑定结果以 Agent 回复为准。
        </p>
      )}
    </section>
  );
}
