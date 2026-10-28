# Embodied

独立的桌面伙伴客户端。AI 和记忆留在服务端，桌宠负责表达、移动、提问与执行回执。HTTP 消息协议、MCP 和 Anelf 频道接入共用一个执行控制器。

## 使用

- 启动后只显示桌宠。单击有触碰反馈，双击打开角色旁的输入气泡；Esc 收起，草稿保留。
- 拖动调整位置。拖动会取消正在执行的桌宠动作，已完成步骤保留；单击不会中断 AI。
- 悬停按钮可打开对话记录、连接设置、形象设置。完整历史和执行回执在二级面板查看。
- 点击停止会同时取消本机动作并向 Anelf 当前会话发送停止请求。后台停止未确认时，界面会保留提示。
- 关闭二级面板不会退出程序。托盘菜单提供显示、隐藏、切换屏幕、停止和退出。

目前内置的是 Microsoft Fluent Emoji 小狐狸临时形象，只有 **1 张静态图**，配合客户端的触碰和表情动画。支持导入自定义静态或序列帧皮肤，详见 [皮肤协议](docs/skins.md)。没有生成或复制 Coopanion 的角色。

## 开发与打包

需要 Node.js 24 和 pnpm 11.25.0；桌宠运行不依赖 Python、uv 或 Anelf 的启动器。

```sh
pnpm install --frozen-lockfile
pnpm start
pnpm check
pnpm test:e2e
pnpm run pack
pnpm run dist
```

`pnpm run pack` 生成 Windows 目录包 `release/win-unpacked/Embodied.exe`；`pnpm run dist` 生成 `release/Embodied-Setup-<版本>-x64.exe` 安装程序。支持选择目录、桌面与开始菜单快捷方式，以及 Windows 应用列表中的完整卸载。注意使用 `pnpm run pack`，`pnpm pack` 是包管理器的源码归档命令。macOS、Linux 有构建配置，但尚未做真机验证；当前发行目标是 Windows。

程序、文档、示例和数据统一放在安装目录。运行数据保存在 `data/`，日志位于 `data/logs/`，自定义皮肤位于 `data/skins/`。安装目录必须对当前用户可写，程序不会静默退回其他目录保存数据。Anelf Token 使用系统加密；系统加密不可用时只在内存保存。日志保留两份约 256 KB 的文件，磁盘缓存限额为 64 MB。桌宠不读写 Anelf 的本地数据目录。

**卸载会删除本次安装的全部程序数据，包括配置和自定义皮肤，不默认保留。** 升级保留数据；皮肤开发的源素材请存放在安装目录之外。详见 [安装与卸载](docs/installation.md)。

## 连接 Anelf

在悬停工具栏的连接设置中填写 **HTTP API 频道地址**、频道 `api_token`、用户标识和会话标识。WebUI 地址、WebUI 登录密码不是频道凭据。HTTPS 使用正常的证书校验。

客户端通过 `/api/chat` 发消息、`/api/chat/stream` 接收 SSE、`/api/sessions/history` 同步历史，通过 `/api/sessions/control` 停止会话。模型收到当前轮次的桌宠协议说明，普通文本显示为回复，合法协议 JSON 执行动作。读取历史不会重新执行指令。

SSE 中断后自动退避重连；无法确认的发送不自动重发。本轮终止帧丢失时，请点击停止同步状态，再继续发送。`ask` 的回答会自动作为事件回传；其他指令可设置 `returnReceipt: true`。回传失败可在回执面板重试，使用相同消息 ID 避免重复入站。

## HTTP 与 MCP

本机控制端默认 `http://127.0.0.1:46187`，控制 Token 在连接设置的「MCP / 消息协议」中查看。所有请求都需要 `Authorization: Bearer <Token>`；服务仅监听回环地址，拒绝浏览器跨站请求。

支持 Streamable HTTP MCP：地址为 `/mcp`，工具为 `pet_capabilities`、`pet_execute`、`pet_cancel`、`pet_state`。执行最长可能持续五分钟，调用方应设置适当的工具超时。SDK 的取消信号会传入执行控制器。

仅支持 stdio 的 MCP 客户端可连接已运行的桌宠：

```json
{
  "mcpServers": {
    "embodied": {
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

动作与可靠性边界见 [控制协议](docs/protocol.md)，模块划分见 [开发说明](docs/development.md)，Unity 等前端的接口边界见 [前端扩展](docs/frontends.md)。
