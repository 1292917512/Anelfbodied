import { useState } from 'react';

export function McpPanel({
  url,
  token,
  run,
}: {
  url: string;
  token: string;
  run(task: () => Promise<unknown>): void;
}) {
  const [reveal, setReveal] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <section>
      <p className="settings-intro">
        让 Agent 自己接入，
        <br />
        也能管理频道连接。
      </p>
      <label>
        本机 MCP 地址
        <input aria-label="本机 MCP 地址" readOnly value={`${url}/mcp`} />
      </label>
      <label>
        控制 Token
        <div className="secret">
          <input
            aria-label="控制 Token"
            type={reveal ? 'text' : 'password'}
            readOnly
            value={token}
          />
          <button onClick={() => setReveal(!reveal)}>{reveal ? '隐藏' : '显示'}</button>
        </div>
      </label>
      <p className="hint">
        Streamable HTTP，仅允许本机访问。此 Token 授权 Agent 控制桌宠和修改频道设置。
      </p>
      <button
        className="primary"
        onClick={() =>
          run(async () => {
            await window.embodied.copyMcpConfiguration();
            setCopied(true);
          })
        }
      >
        {copied ? '已复制 MCP 配置' : '复制 MCP 配置'}
      </button>
      <p className="hint">
        将配置加入 Agent 的 MCP 客户端。连接后可调用以下工具，无需再手填频道设置。
      </p>
      <dl className="mcp-tools">
        <dt>pet_connection_state</dt>
        <dd>读取配置与连接状态，凭据不回传。</dd>
        <dt>pet_configure_connection</dt>
        <dd>修改频道地址、Token 和会话，并发起连接。</dd>
        <dt>pet_connection_control</dt>
        <dd>连接、断开，或停止当前频道会话。</dd>
      </dl>
      <p className="hint">
        桌宠动作仍使用 pet_execute、pet_cancel 和 pet_state；HTTP 消息协议共用执行逻辑。
      </p>
    </section>
  );
}
