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
      <label>
        本机 MCP 地址
        <input aria-label="本机 MCP 地址" readOnly value={`${url}/mcp`} />
      </label>
      <p className="hint">将配置加入 Agent，即可发现动作、控制桌宠并取得回执。</p>
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
      <details className="disclosure mcp-details">
        <summary>连接详情</summary>
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
        <p className="hint">Streamable HTTP，仅允许本机访问。配置含控制凭据。</p>
        <dl className="mcp-tools">
          <dt>pet_capabilities</dt>
          <dd>发现当前模型动作及行为映射。</dd>
          <dt>pet_execute / pet_cancel</dt>
          <dd>执行或取消动作，返回实际完成的结果。</dd>
          <dt>pet_state</dt>
          <dd>查询执行回执，查询不会重新播放动作。</dd>
        </dl>
        <p className="hint">HTTP 消息协议与 MCP 共用执行入口。附加业务工具由接入模块注册。</p>
      </details>
    </section>
  );
}
