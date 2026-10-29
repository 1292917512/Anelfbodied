# 开发与验证

## 核心概念

| 概念                       | 职责                                     | 不负责                         |
| -------------------------- | ---------------------------------------- | ------------------------------ |
| Command / Receipt          | 一批操作、到期、逐步结果、部分完成       | 频道业务、窗口布局             |
| ControlService             | 统一提交、查询、去重、取消               | HTTP、MCP SDK 或 Anelf 协议    |
| ActionDriver               | 执行动作，取消后返回真实结果             | 另建队列或去重表               |
| PresentationChannel        | 交付执行与取消，匹配确认，重置失联执行器 | 模型资源                       |
| ModelSession               | 模型激活、动作时段、环境行为恢复、释放   | 网络会话、原生窗口             |
| BehaviorPreset             | 根据交互信号选择语义行为，提供通用反馈   | 自行发命令、控制通信或改写皮肤 |
| SkinLoader / ModelRenderer | 将具体模型映射为通用动作并显示           | 通用协议、上层业务             |
| ModelSourceProvider        | 发现及只读打开外部资源                   | 占有或删除外部模型             |

行为是“何时回应”，动作是“播放什么”；比如 `drag` 可以映射到任意模型动作。名为 `move` 的模型动作只播放动画，`action:move` 才改变桌面位置。

## 目录和依赖

```text
src/
  protocol/                 命令、呈现消息、模型能力
  runtime/                  唯一控制器、回执日志、呈现驱动、模型激活校验
  model/                    模型契约、资源来源契约、会话与注册表
  behavior/                 行为契约、注册表、映射输入
  components/
    png/                    PNG 配置、加载与帧播放
    live2d/                 Cubism 配置、加载、绘制、音频、模型库适配
  behaviors/
    idle/ touch/ drag/ drop/ move/ talk/ emotion/
                             各自的行为选择与轻量反馈
  transports/               通用 HTTP、MCP、stdio；提供 MCP 扩展注册点
  integrations/anelf/        Anelf HTTP/SSE、配置、会话、技能引导、MCP 工具
    ui/                     Anelf 表单与技能安装说明
  skins/                    皮肤存储、资源白名单、模型库、行为偏好
  composition/              模型、来源、行为与构建资源的注册入口
  host/                     Electron 组合入口、窗口、IPC、输入穿透和存储路径
  contracts/                桌面应用契约、通用频道状态、更新状态
  renderer/
    components/             模型显示与静态缩略图
    pet/                    呈现执行器、气泡、手势、行为适配
      wheel/                轮盘组件、布局与样式
    panel/                  外观、行为编辑、连接容器、回执与更新界面
  updates/                  产品更新业务
```

`protocol/runtime/model/behavior` 是通用核心，不引用 Electron、React、Anelf、具体模型/行为组件或产品存储。模型组件相互独立，行为组件只引用行为契约。通用传输层不引用 Anelf；业务工具通过 `McpExtension` 注入。ESLint 与 `tests/architecture.test.ts` 自动检查这些边界。

`contracts/client.ts` 是当前桌面产品的组合契约，因此会包含 Anelf 配置和更新状态；它不是通用核心接口，核心也不引用它。新增产品功能不应为方便而进入 `runtime/`。现在只有一种对话业务接入，不额外维护一套没有实现需求的万能频道框架。

## 执行链路

```text
HTTP / MCP → ControlService → Controller → ActionDriver
                                 ↓              ↓
                              Journal     PresentationDriver
                                                ↓ PresentationChannel
                                           Electron IPC
                                                ↓
                                  PetEngine → ModelSession → ModelInstance
                                                             PNG / Live2D
```

控制器唯一负责队列、来源、去重、期限和部分完成。MCP 的 SDK 取消、消息协议取消、前端停止都进入既有取消链路。模型组件先停止效果、语音和资源任务，再回传取消；失联且无法确认时返回 unknown，不假报成功。切换皮肤生成新的 revision，拒绝旧版本的新动作；重试旧批次仍先返回已有回执。

Anelf HTTP 频道属于 `integrations/anelf/`：它处理会话历史、SSE 重连、技能字段和远端停止，把话语转换成呈现命令。它不解析正文里的动作 JSON。Agent 的动作由关联 MCP 调用同一控制器；回执留在工具调用内。

`integrations/anelf/mcp.ts` 注册业务连接工具；`transports/mcp.ts` 只注册通用控制工具。`host/main.ts` 装配两者，并提供系统加密、窗口与 IPC 权限。新业务接入可在自己的目录中实现协议、配置与界面，在产品装配入口接入；无需修改执行核心。

## 交互和编辑生命周期

- `usePetGestures` 区分单击、双击、拖动与头部抚摸。抚摸有阈值和冷却；pointercancel、失去捕获或窗口失焦都会释放拖动状态。
- `BehaviorRegistry` 根据优先级选取当前行为；每个预设的说明和反馈放在自己的目录。界面信号与模型动作通过映射连接，不在页面中按模型类型分支。
- `useBehavior` 将反馈交给 Web Animations；有对应非静态模型动作时抑制外层变形，显式 perform 期间也不叠加环境反馈。系统减少动态效果设置会关闭通用动画。
- `ModelSession` 管理环境动作，映射改变时就地更新。正在执行的 perform 不受修改映射影响，结束后恢复最新环境行为。
- `PetWheel` 使用固定尺寸，按屏幕边缘选择位置；支持方向键、Enter、Esc。点击轮盘的聊天直接转入气泡，不反复失焦。
- 原生面板只在从隐藏状态打开时靠近角色定位。缩放和修改行为不重新打开、移动或调整面板。显示器变更只将面板限制在可用区域。
- `usePointerRegions` 只测量角色、可见气泡和轮盘，空白桌面继续穿透。原生拖动捕获有超时，退出仍等待执行回执后再销毁窗口。
- 模型库展开后才检索；外观预览固定大小且静音，不受桌面比例影响。连接页高级字段和技能说明默认折叠。

## 存储边界

沿用原 `settings.json` 和 `appearance.json` 格式，不迁移旧数据。行为覆盖单独原子写入 `data/behaviors.json`，按皮肤 ID 隔离；恢复默认只删除覆盖项。不存在的旧动作不会进入有效映射，外部资源恢复后原覆盖仍可使用。

用户皮肤与模型引用在 `data/skins/`。Steam、WPK 或原生模型源不写入、不删除。模型来源配置保存在 `model-library.json`。运行数据、测试模型、截图、构建目录均不提交。

## 扩展入口

1. **模型类型**：在 `components/<type>/` 实现 SkinLoader、ModelRenderer；装配处注册。组件可自行提供 ModelSourceProvider 和 assets.json。见[前端接口](frontends.md)。
2. **行为预设**：在 `behaviors/<name>/` 实现 BehaviorPreset，加入 `composition/behaviors.ts`。说明、选择条件、优先级和反馈在同目录；界面与能力列表自动发现。见[行为扩展](behaviors.md)。
3. **通信入口**：消费 ControlService，不调用 Controller 私有状态，不维护平行执行队列；业务协议转换放在 `integrations/<name>/`。
4. **前端平台**：Unity 等可实现 PresentationChannel / ActionDriver；不必引用 React、DOM 反馈或 Cubism Web 组件。
5. **MCP 业务工具**：通过 McpExtension 注入已有认证服务，继续传播 SDK AbortSignal。不要把产品配置加入通用动作协议。

## 验证命令

```sh
pnpm check
pnpm format:check
pnpm test:e2e
```

`check` 执行类型检查、依赖边界、单元/传输测试与源码构建。E2E 启动隔离 Electron 实例，覆盖轮盘、触摸/拖动、固定编辑窗口、行为映射、断连、取消、部分回执、进程恢复、旧 PNG 皮肤和屏幕边缘布局，不修改实际安装数据。

E2E 会显示并操作真实桌面窗口。运行前关闭同项目的开发实例，避免多个悬浮窗口叠加引发输入接管；测试结束后再启动日常使用实例。

可选真实模型验证（设置为本地资源）：

```powershell
$env:EMBODIED_LIVE2D_FIXTURE = '本地原生 Live2D runtime 目录'
$env:EMBODIED_WPK_FIXTURE = '本地导出的模型.wpk'
$env:EMBODIED_VIEWEREX_FIXTURE = 'D:/SteamLibrary/steamapps/common/Live2DViewerEX'
pnpm test:e2e
```

测试实际 Cubism 绘制、动作、音频节点停止和切换。素材不随程序发布。

Anelf 真实 HTTP/HTTPS 契约夹具复制必要源文件到隔离目录，不加载原项目凭据、记忆或数据库。需要具备主项目依赖的 Python 环境：

```powershell
$env:PYTHONDONTWRITEBYTECODE = '1'
python tests/fixtures/anelf_channel.py --source E:/ELFProgram/AnelfAgent --output "$PWD/.build/anelf-contract"
```

另一个终端设置 `ANELF_FIXTURE=.build/anelf-contract/ready.json` 和 `NODE_EXTRA_CA_CERTS=.build/anelf-contract/test-cert.pem` 的绝对路径后运行 E2E。夹具使用确定性代理验证频道、技能标签及 MCP 关联，不是模型回答质量测试；HTTPS 只信任临时测试证书，不关闭证书校验。夹具五分钟后退出，也可创建输出目录中的 `stop` 文件结束。

打包程序可通过 `EMBODIED_EXECUTABLE` 指定后运行同一套 E2E；安装、覆盖和卸载测试另见[安装文档](installation.md)。普通功能验证不需要打包。

`EMBODIED_DATA_DIR` 指定隔离数据目录，`EMBODIED_PORT=0` 自动选择空闲端口。`EMBODIED_TEST=1` 仅用于自动化诊断，生产默认端口为 46187。
