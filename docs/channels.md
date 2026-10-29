# 频道与 AI 接入

## 连接 Anelf

在操作轮盘的连接设置中填写 **HTTP API 频道地址**、频道 `api_token`、用户标识和会话标识。WebUI 地址、WebUI 登录密码不是频道凭据。HTTPS 使用正常的证书校验。

频道设置中的“技能名称”可填写该 Anelf 服务已有的 Skill 名称，例如 `anelfbodied-control`。客户端在用户消息的 `/api/chat` 请求中单独传递 `skills: ["anelfbodied-control"]`，Anelf 将其转为内部技能标签，加载正文及关联 MCP 状态。`message` 只传原始话语，不追加标签或协议提示。未填写、仅含空白或旧配置没有此项时，发送时统一使用默认技能 `anelfbodied-control`；读取旧配置不会改写文件。名称最多 64 字符，仅支持小写字母、数字、下划线及非首尾的连字符；不是路径，也不是文件内容。此项仅在频道界面设置，不扩展 MCP 工具。

客户端通过 `/api/chat` 发消息、`/api/chat/stream` 接收 SSE、`/api/sessions/history` 同步历史，通过 `/api/sessions/control` 停止会话。频道回复只作为话语显示，JSON 形状的内容也不会执行动作。Agent 通过 Skill 关联的 MCP 控制桌宠，工具执行与最终文字回复可以在同一轮完成。

首次接入或需要重新核对时，先连接频道，再手动点击“让 AI 安装技能”。展开“说明与安装进度”可查看待发送内容和 Agent 回复。说明包含官方技能来源、当前桌宠的实际 MCP 地址、端口和控制 Token，请求 Agent 缺失时安装 Skill，并通过工具配置 MCP、绑定 Skill。消息会进入目标 Anelf 会话记录；发送成功不代表安装或绑定成功，Agent 需要验证技能、绑定及 MCP 调用后回复“安装完成”，失败则说明原因。连接、启动和自动重连都不会触发发送。此安装请求不带 `skills` 字段，后续普通聊天正常携带技能选择。

保存配置后依次显示“连接中 → 同步历史 → 已连接”。固定状态栏显示当前阶段；配置保存成功不代表已连接。首次连接失败会显示原因并停止尝试，可修改配置或手动重试；等待响应超过 15 秒视为超时，连接和同步均可取消。历史暂时不可用但实时连接正常时，保留连接并显示提示。

已连接的 SSE 中断后自动退避重连，可点击“停止重连”；认证失败、接口地址错误或证书无效时停止重试。无法确认的发送不自动重发。本轮终止帧丢失时，请点击停止同步状态，再继续发送。历史只补充显示，不重播动作。`ask` 的回答由 MCP 执行回执返回，回执不再作为聊天事件发送；界面仍可查看实际执行结果。

## HTTP 与 MCP

本机控制端默认 `http://127.0.0.1:46187`，控制 Token 在连接设置的「MCP / 消息协议」的“连接详情”中查看。所有请求都需要 `Authorization: Bearer <Token>`；服务仅监听回环地址，拒绝浏览器跨站请求。

支持 Streamable HTTP MCP：地址为 `/mcp`，工具为 `pet_capabilities`、`pet_execute`、`pet_cancel`、`pet_state`。执行最长可能持续五分钟，调用方应设置适当的工具超时。SDK 的取消信号会传入执行控制器。另提供 `pet_connection_state`、`pet_configure_connection`、`pet_connection_control`，让已认证的 Agent 管理频道设置、连接和停止；详见 [MCP 连接配置](mcp-connection.md)。设置页可直接复制 MCP 客户端配置。

仅支持 stdio 的 MCP 客户端可连接已运行的桌宠：

```json
{
  "mcpServers": {
    "AnelfBodied": {
      "command": "node",
      "args": ["E:/ELFProgram/DeskTop_Embodied/dist/host/stdio.js"],
      "env": {
        "EMBODIED_URL": "http://127.0.0.1:46187",
        "EMBODIED_TOKEN": "替换为本机控制 Token"
      }
    }
  }
}
```

HTTP 示例（Node.js）：

```js
const command = {
  protocol: 'desktop-pet/1',
  id: crypto.randomUUID(),
  session: crypto.randomUUID(),
  expiresAt: Date.now() + 60_000,
  commands: [
    { action: 'say', text: '你好，我在。', durationMs: 3000 },
    { action: 'ask', question: '继续吗？', options: ['继续', '稍后'] },
  ],
};
await fetch('http://127.0.0.1:46187/v1/commands', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(command),
});
```

动作与可靠性边界见 [控制协议](protocol.md)，模块划分见 [开发说明](development.md)，Unity 等前端的接口边界见 [前端扩展](frontends.md)。

## AI 操作 Skill

项目与安装包均提供 [anelfbodied-control](../skills/anelfbodied-control/SKILL.md)。将整个 `skills/anelfbodied-control/` 文件夹交给 Agent 的 Skill 加载器，保留 `references/` 的目录层级。入口按 MCP、HTTP、Anelf 频道和表达、移动、问答、连接管理、取消恢复分别引导阅读。

MCP 接入需要提供桌宠设置页的 MCP 配置。Anelf 服务端安装相应 Skill 后，将它绑定到实际桌宠 MCP 服务，再在桌宠频道设置中填写技能名称。关联不等于连接或工具激活，Agent 按任务需要唤醒；详见 [频道与技能绑定](../skills/anelfbodied-control/references/access/anelf-channel.md)。客户端不上传或安装服务端技能。服务端需支持 `/api/chat` 的 `skills` 字段；频道已连接不代表技能或 MCP 已就绪。Anelf 只自动加载 `SKILL.md` 正文，关键操作规则已放在入口，分层文档供按需查阅。桌宠 MCP 默认只监听本机，远端 Anelf 需要另行配置可达的受认证连接。
