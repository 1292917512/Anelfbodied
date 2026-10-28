# AnelfBodied

独立的桌面伙伴客户端。AI 和记忆留在服务端，桌宠负责表达、移动、提问与执行回执。HTTP 消息协议、MCP 和 Anelf 频道接入共用一个执行控制器。

项目官网：[anelf.cn](https://anelf.cn)。

## 使用

- 启动后只显示桌宠。单击有触碰反馈，双击打开角色旁的输入气泡；Esc 收起，草稿保留。
- 拖动调整位置。拖动会取消正在执行的桌宠动作，已完成步骤保留；单击不会中断 AI。
- 悬停按钮可打开对话记录、连接设置、形象设置。完整历史和执行回执在二级面板查看。
- 点击停止会同时取消本机动作并向 Anelf 当前会话发送停止请求。后台停止未确认时，界面会保留提示。
- 关闭二级面板不会退出程序。托盘菜单提供显示、隐藏、切换屏幕、停止和退出。

默认形象为根据用户参考图设计的银蓝猫耳 Q 版角色，配套同形象应用图标。当前提供 **1 帧站姿**，配合客户端的触碰、移动和情绪反馈。支持自定义静态或序列帧皮肤，详见 [皮肤协议](docs/skins.md) 和 [形象素材说明](docs/character.md)。

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

`pnpm run pack` 生成 Windows 目录包 `.build/package/win-unpacked/AnelfBodied.exe`；`pnpm run dist` 生成 `release/AnelfBodied-Setup-<版本>-x64.exe` 安装程序。`release/` 仅保留最新成功构建的单个 Windows x64 安装包；目录包、打包缓存、调试信息和 NSIS 生成文件放在 `.build/`，源码编译结果放在 `dist/`。构建失败不会删除上次成功的安装包，打包不会自动发布。

安装程序支持选择目录、桌面与开始菜单快捷方式，以及 Windows 应用列表中的完整卸载。注意使用 `pnpm run pack`，`pnpm pack` 是包管理器的源码归档命令。macOS、Linux 有构建配置，但尚未做真机验证；当前发行目标是 Windows。

程序、文档、示例和数据统一放在安装目录。运行数据保存在 `data/`，日志位于 `data/logs/`，自定义皮肤位于 `data/skins/`。安装目录必须对当前用户可写，程序不会静默退回其他目录保存数据。Anelf Token 使用系统加密；系统加密不可用时只在内存保存。日志保留两份约 256 KB 的文件，磁盘缓存限额为 64 MB。桌宠不读写 Anelf 的本地数据目录。

**卸载会删除本次安装的全部程序数据，包括配置和自定义皮肤，不默认保留。** 升级保留数据；皮肤开发的源素材请存放在安装目录之外。详见 [安装与卸载](docs/installation.md)。

## 连接 Anelf

在悬停工具栏的连接设置中填写 **HTTP API 频道地址**、频道 `api_token`、用户标识和会话标识。WebUI 地址、WebUI 登录密码不是频道凭据。HTTPS 使用正常的证书校验。

频道设置中的“技能名称”可填写该 Anelf 服务已有的 Skill 名称，例如 `anelfbodied-control`。客户端会在用户消息和执行回执的 `/api/chat` 请求中传递 `skills: ["anelfbodied-control"]`，由对应服务为该次执行加载技能。留空不传此字段，旧配置默认留空。名称最多 64 字符，仅支持小写字母、数字、下划线及非首尾的连字符；不是路径，也不是文件内容。此项仅在频道界面设置，不扩展 MCP 工具。

客户端通过 `/api/chat` 发消息、`/api/chat/stream` 接收 SSE、`/api/sessions/history` 同步历史，通过 `/api/sessions/control` 停止会话。模型收到当前轮次的桌宠协议说明，普通文本显示为回复，合法协议 JSON 执行动作。读取历史不会重新执行指令。

SSE 中断后自动退避重连；无法确认的发送不自动重发。本轮终止帧丢失时，请点击停止同步状态，再继续发送。`ask` 的回答会自动作为事件回传；其他指令可设置 `returnReceipt: true`。回传失败可在回执面板重试，使用相同消息 ID 避免重复入站。

## HTTP 与 MCP

本机控制端默认 `http://127.0.0.1:46187`，控制 Token 在连接设置的「MCP / 消息协议」中查看。所有请求都需要 `Authorization: Bearer <Token>`；服务仅监听回环地址，拒绝浏览器跨站请求。

支持 Streamable HTTP MCP：地址为 `/mcp`，工具为 `pet_capabilities`、`pet_execute`、`pet_cancel`、`pet_state`。执行最长可能持续五分钟，调用方应设置适当的工具超时。SDK 的取消信号会传入执行控制器。另提供 `pet_connection_state`、`pet_configure_connection`、`pet_connection_control`，让已认证的 Agent 管理频道设置、连接和停止；详见 [MCP 连接配置](docs/mcp-connection.md)。设置页可直接复制 MCP 客户端配置。

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

动作与可靠性边界见 [控制协议](docs/protocol.md)，模块划分见 [开发说明](docs/development.md)，Unity 等前端的接口边界见 [前端扩展](docs/frontends.md)。

## AI 操作 Skill

项目与安装包均提供 [anelfbodied-control](skills/anelfbodied-control/SKILL.md)。将整个 `skills/anelfbodied-control/` 文件夹交给 Agent 的 Skill 加载器，保留 `references/` 的目录层级。入口按 MCP、HTTP、Anelf 频道和表达、移动、问答、连接管理、取消恢复分别引导阅读。

MCP 接入需要提供桌宠设置页的 MCP 配置。Anelf 频道接入只需在服务端安装相应 Skill，再在频道设置中填写其名称；客户端不会上传文件，也不会安装服务端技能。服务端需支持 `/api/chat` 的 `skills` 字段；连接成功不代表技能已存在或已加载。当前 Anelf 按名称注入 `SKILL.md` 正文，不会递归注入链接的文档；客户端仍携带本轮协议、动作说明和会话有效期，完整分层文档供支持文件读取的 Agent 按需查阅。
