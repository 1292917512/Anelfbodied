# 前端与平台扩展

当前产品使用 Electron 和 React。Unity 前端尚未实现，但执行逻辑已通过接口与窗口、IPC 和图片渲染分离。

```text
HTTP / MCP / Anelf 频道
          ↓
Controller ── Journal
          ↓ ActionDriver
PresentationDriver
          ↓ PresentationChannel
Electron IPC / 未来的 Unity 通信适配器
          ↓
React PetEngine / 未来的 Unity 动作执行器
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

当前 PNG 皮肤协议属于二维资源适配层。Unity 可为相同动作名绑定 Animator、模型和音频，无需把 Unity 模型塞进 PNG 皮肤格式。新增动作时必须同时更新协议、能力声明、目标前端实现和测试，不能把暂不支持的动作伪装为完成。
