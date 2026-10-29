# 前端与平台扩展

当前产品使用 Electron 和 React。Unity 前端尚未实现，但执行逻辑已通过接口与窗口、IPC 和图片渲染分离。

```text
HTTP / MCP / Anelf 频道
          ↓ ControlService
Controller ── Journal
          ↓ ActionDriver
PresentationDriver
          ↓ PresentationChannel
Electron IPC / 未来的 Unity 通信适配器
          ↓
React PetEngine / 未来的 Unity 动作执行器
          ↓ ModelSession → ModelInstance
PNG / Live2D / 其他已注册组件
```

## 接口职责

- `protocol/schema.ts`：外部命令、取消、能力与回执。不同前端使用同一份协议语义。
- `runtime/controller.ts`：唯一的队列、来源隔离、去重、到期、部分完成与持久化；不引用 Electron、React 或通信适配器。
- `runtime/ports.ts`：`ActionDriver` 接受动作和 `AbortSignal`，返回真实执行结果；`PresentationChannel` 负责传递命令和重置失去响应的连接。
- `runtime/presentation-driver.ts`：匹配命令 ID、等待回执、确认取消、处理断线和超时；可供多个平台适配器复用。
- `protocol/presentation.ts`：进程间的执行、取消与回答结构，可生成 JSON Schema 供其他语言实现。
- `host/renderer-driver.ts`：只把 Electron 的消息和进程事件接到上述接口。
- `contracts/client.ts`：当前桌面界面需要的状态和操作契约，不包含 Electron 实现；窗口操作是桌面适配层能力，不属于通用动作协议。
- `renderer/pet/engine.ts`：当前二维前端的动作实现，不读取凭据或管理通信连接。

ESLint 限制核心层引用桌面或通信实现，也限制 React 页面直接引用主进程和运行时。

Anelf HTTP/SSE、配置、技能和连接工具集中在 integrations/anelf/，通用 HTTP/MCP 传输层没有 Anelf 依赖。产品通过 McpExtension 注册业务工具，未来更换业务接入无需修改 ControlService。contracts/client.ts 是桌面产品组合契约，不属于可移植执行核心。

## Unity 接入步骤

1. 保留核心运行时及 HTTP/MCP 入口，创建一个实现 `PresentationChannel` 的通信适配器。可选本机管道或经过认证的 WebSocket；这一传输尚未提供。
2. Unity 准备好角色、输入与渲染后，适配器调用 `driver.ready()`。连接关闭时调用 `driver.disconnected(reason)`，当前动作会得到 `unknown`，不会自动重放。
3. Unity 按 ID 执行动作并返回 `presentationReplySchema` 描述的结果。适配器调用 `driver.acknowledge(reply.id, reply.result)`。
4. 收到取消后，在 Unity 主线程停止相关协程、动画、移动和提问，再回传 `cancelled`。不能仅收到取消请求就声称已取消。
5. 如果一秒内没有取消确认，通用驱动将结果标为 `unknown` 并调用通道的 `reset()`。Unity 适配器必须保证旧执行器不能在新连接中继续动作。
6. 新的组合入口注入该驱动，替换 Electron 窗口创建逻辑。不要在 Unity 传输层重新维护去重表、命令队列或 Anelf 会话。

执行消息：

```json
{
  "type": "execute",
  "id": "execution-id",
  "action": { "action": "say", "text": "你好", "durationMs": 3000 }
}
```

取消消息与确认：

```json
{"type":"cancel","id":"execution-id"}
{"id":"execution-id","result":{"outcome":"cancelled"}}
```

执行 ID 是宿主生成的单步标识，与外部整批命令 ID 分开。过期、重复或不属于当前执行的回执不得完成新的动作。前端仅负责本次呈现，整批结果由控制器汇总。

## 资源边界

src/model/ 只定义模型契约、注册表和生命周期，不引用 PNG、Live2D、Electron 或 React。src/components/png/ 与 src/components/live2d/ 分别包含自己的配置、资源加载和渲染；互不引用。src/composition/ 是产品装配入口，注入主进程的 SkinLoader、前端的 ModelRenderer 以及组件构建资源。新增模型类型时不修改协议、控制器、MCP 或公共注册表。

SkinLoader 只处理数据包并返回规范化模型、动作和行为绑定。ModelRenderer.mount 加载并返回 ModelInstance；play 完成资源准备并开始替换播放，允许组件衔接上一段姿态，返回时表示已经开始播放。正常行为切换不先调用 stop；显式取消、关闭行为和释放仍要求同步停止效果。dispose 必须释放资源。Live2D 使用原生动作队列淡入淡出，PNG 替换自己的序列帧计时器。方法抛错、加载超时、显卡上下文丢失均进入 error 状态，不发布 ready。宿主只在资源和待机动作都可用后报告就绪。

ModelInstance.hitMask 返回当前画面的不透明区域，坐标覆盖整个模型容器（包含留白），未就绪或已释放时返回 undefined。掩码最大为 256 × 256，按行排列，每个采样点占一位（低位在前）。PNG 按当前帧及宽高比生成掩码；Live2D 在绘制后读取透明度，最多每 80 ms 更新一次，未使用命中接口的预览停止采样。共用的 alphaSampler 排除透明度低于 32/255 的像素，不包含 CSS 阴影。

前端通过三个定位点取得模型的实际变换，将相同掩码用于鼠标手势和宿主穿透判断，因此缩放、旋转和行为动画不扩大点击区域。气泡、轮盘以及加载错误提示使用各自的控件区域。拖拽必须从模型可见部分开始；开始后保留指针捕获，直到释放、取消或窗口失焦。新增模型组件只需提供掩码，不必修改消息层、MCP 或鼠标处理器。

Electron 的跨屏拖动由 `host/pet-drag.ts` 处理：界面提交模型内的抓取比例和当前可见轮廓，宿主使用系统 DIP 坐标选择显示器并返回归一化位置。限制依据是不透明角色轮廓，透明画布可越出工作区；气泡和轮盘独立限制在屏幕内。轮廓复用 `hitMask()` 并应用表面变换，模型组件无需增加接口。此平台实现不进入执行核心，其他前端可按自己的窗口系统实现拖动。

ModelSession 负责当前激活版本、展示时段、取消、待机恢复和释放。ModelRegistry 在统一控制层再次校验版本、就绪状态和动作名称。换肤生成新的 revision；重复指令仍先按原始内容去重，队列里尚未执行的旧模型动作会失败。模型动作通过 perform 进入同一条队列，不另外维护执行状态。

行为定义位于 behavior/，具体预设位于 behaviors/<name>/，由 composition/behaviors.ts 注入。ModelSession.updateBindings 支持就地修改行为映射，不重新挂载模型；当前 perform 结束后恢复最新映射。前端通过适配器将通用反馈转为 DOM 动画，模型组件不需要了解鼠标、轮盘或 Anelf。Unity 可复用行为语义和映射，提供自己的反馈实现。详见[行为扩展](behaviors.md)。

扩展入口：

1. 在 src/components/<type>/ 实现 loader.ts 和 renderer.ts，将本组件的 schema、资源及辅助实现放在同目录。
2. 分别在 src/composition/skin-loaders.ts 和 model-renderers.ts 注册。模型类型选项来自加载器注册表。
3. 有额外构建资源时，在组件目录声明 assets.json，并加入 src/composition/model-assets.json；构建脚本负责通用复制，不识别具体模型类型。
4. 按接口验证加载失败、取消、释放、重复调用与切换。ESLint 和架构测试会检查依赖方向。

Unity 可实现独立的 PresentationChannel/ActionDriver；不需要依赖浏览器的 DOM 组件接口。它为自己的模型发布同样的动作描述与 revision，遵循相同的 perform、取消和回执协议。

SDK 文件独立存放于 vendor/cubism/，由 Live2D 组件引用。第三方许可证与来源摘要在那里保留；本地测试角色不进入产品构建。

## 模型来源接口

```text
外观界面 → host/appearance.ts → skins/library.ts
                                  ↓ ModelSourceProvider
                          components/live2d/library/
                          Steam 发现 / ZIP 索引 / LPK 解码 / 数据规范化
                                  ↓ ModelSource（manifest + read）
                             skins/catalog.ts → SkinLoader
                                  ↓
                      已注册皮肤与动态动作 → 公共控制接口
```

- src/model/source.ts 定义来源、候选项、只读资源和模型库快照，不包含 Steam 或压缩包逻辑。
- src/skins/library.ts 负责来源配置、检索合并和去重；src/skins/catalog.ts 负责引用持久化、校验和资源生命周期。
- src/components/live2d/library/ 集中实现 Steam 位置发现、文件浏览、WPK/LPK 读取和 ViewerEX 数据适配；audio.ts 管理语音的开始、取消与释放。
- src/composition/model-sources.ts 注入来源实现。其他组件添加自己的来源适配器即可，不需要改公共目录服务、MCP 或消息协议。
- src/host/appearance.ts 仅负责可信界面 IPC、系统选择器和服务编排。src/renderer/panel/ModelLibraryPanel.tsx 只消费通用模型库契约。

资源库浏览不会预先加载所有纹理，使用时才读取并校验。模型包不解压到磁盘，应用只保留受限内存快照与小型来源引用；切换动作名称通过现有注册表公开给 MCP。
