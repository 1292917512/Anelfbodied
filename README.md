# AnelfBodied

独立的桌面具身客户端。AI 负责思考，客户端负责表达、移动、交互与真实执行回执。支持 PNG、序列帧、Live2D Cubism 3+；MCP 与 HTTP 消息协议共用执行核心，Anelf 频道作为独立业务接入。

官网：[anelf.cn](https://anelf.cn)。

## 桌面操作

- **单击**打开操作轮盘：聊天、形象、连接、对话记录、摸摸和停止。方向键选择，Enter 执行，Esc 收起。
- **双击**打开角色旁的输入气泡；收起后保留未发送草稿。
- **拖动**可跨屏移动角色，按角色可见轮廓贴到工作区边缘，透明留白不占边距；同时接管当前本机动作，保留已完成步骤。拎起和放下分别触发行为，气泡和轮盘独立避让屏幕边缘。
- 在头部**来回抚摸**会有触摸反馈，不必打开面板。
- **形象 → 交互与行为**可给当前皮肤的待机、触摸、拖动、移动、说话和情绪指定动作。缺少专属动作时使用轻量反馈，也可关闭反馈。
- **停止**同时取消本机动作并向 Anelf 当前会话发送停止请求。未确认的停止会显示错误。
- 关闭面板不退出程序；托盘提供显示、隐藏、切换屏幕、停止和退出。

桌宠大小支持 **25%–1000%**，可拖滑块或输入百分比。预览图固定大小，已经打开的编辑面板保持位置和尺寸。屏幕不足时临时适配，保留请求的尺寸配置。

默认角色为银蓝猫耳 Q 版形象，目前有 **1 帧站姿**，由行为组件补充动态反馈。原生 Live2D 文件夹、Live2DViewerEX 的 WPK/LPK 和 Steam 模型库均可导入或引用；模型库按需展开检索，不改写源资源。具体支持范围见[皮肤与模型](docs/skins.md)。

## 接入 AI

连接页默认只显示频道地址、API Token 和连接操作；会话标识、技能名称等位于“更多选项”。填写 Anelf 的 **HTTP API 频道**地址和凭据，不能使用 WebUI 登录信息。

普通频道消息只有话语，动作由关联的 MCP 工具执行。默认技能名为 `anelfbodied-control`，空白输入也使用此默认值。连接后可手动点击“让 AI 安装技能”，展开查看说明与结果；不会在启动或重连时自动发送。

MCP 地址默认 `http://127.0.0.1:46187/mcp`。在“MCP / 消息协议”中复制配置；连接详情包含本机控制 Token。Agent 先调用 `pet_capabilities` 发现当前模型动作与行为映射，再通过 `pet_execute` 执行；`pet_cancel` 取消，`pet_state` 查询回执。所有入口使用同一份去重、队列与取消规则。

- [频道、技能与 MCP 接入](docs/channels.md)
- [控制协议与回执](docs/protocol.md)
- [Agent 管理频道配置](docs/mcp-connection.md)
- [AI 操作 Skill](skills/anelfbodied-control/SKILL.md)

## 本地开发

需要 Node.js 24、pnpm 11.25.0；应用不依赖 Python、uv 或 Anelf 启动器。

```sh
pnpm install --frozen-lockfile
pnpm start
pnpm check
pnpm test:e2e
```

`pnpm start` 编译后直接启动本地应用，功能验证不需要安装包。测试使用隔离数据目录；可选真实模型与 Anelf 频道验证见[开发文档](docs/development.md)。

## 模块与扩展

```text
通用 HTTP / MCP ──────────┐
Anelf 业务接入 ───────────┤
                         ↓ ControlService
                 执行核心 / 取消 / 回执
                         ↓ ActionDriver
                 前端呈现与模型生命周期
                         ↓ ModelInstance
                    PNG / Live2D / ...

交互信号 → 行为注册表 → 当前皮肤映射 → 模型动作 / 轻量反馈
```

- **核心**：`protocol/`、`runtime/`、`model/`、`behavior/`；不引用具体业务、桌面平台或模型组件。
- **业务接入**：`integrations/anelf/` 集中保存 HTTP/SSE、配置、技能引导、界面及 MCP 扩展工具。
- **模型组件**：`components/<type>/` 集中实现加载、渲染及资源来源。
- **行为组件**：`behaviors/<preset>/` 集中定义触发条件、优先级、说明与反馈。
- **装配与平台**：`composition/` 注册组件；`host/` 处理 Electron、IPC 授权和生命周期。

新增模型或行为只添加自己的目录并在装配处注册，不修改执行核心。详细层级、依赖规则与扩展步骤见[开发架构](docs/development.md)、[前端接口](docs/frontends.md)和[行为扩展](docs/behaviors.md)。Unity 等前端可实现同一呈现接口，目前没有内置 Unity 前端。

## 安装、升级与数据

```sh
pnpm run pack
pnpm run dist
```

| 目录       | 内容                                           |
| ---------- | ---------------------------------------------- |
| `dist/`    | 源码编译结果                                   |
| `.build/`  | 目录包、打包缓存和构建中间文件                 |
| `release/` | 最新成功构建的单个 Windows x64 安装包          |
| `data/`    | 当前应用的配置、皮肤、行为映射、日志与有界回执 |

构建不会自动发布。覆盖安装保留数据；卸载默认保留数据，可勾选完整删除。数据保存在可写的安装目录内，不修改 Anelf 数据或外部模型资源。Windows 是当前验证目标；macOS/Linux 尚未真机验证。

详见[安装与卸载](docs/installation.md)、[素材说明](docs/character.md)和[第三方声明](THIRD_PARTY_NOTICES.md)。
