# Agent 管理频道连接

桌宠启动后，“连接设置 → MCP / 消息协议 → 复制 MCP 配置”提供本机 Streamable HTTP MCP 地址和认证头。将这份配置加入运行在本机的 Agent 客户端，Agent 即可控制桌宠及配置 Anelf HTTP/HTTPS 频道。不同客户端的配置文件位置由该客户端决定。

首次接入仍需要把 MCP 地址和控制 Token 提供给 Agent。桌宠不开放匿名配置，也不自动读取其他应用的凭据。本机控制 Token 与 Anelf 频道的 API Token 是两种不同的凭据。

## 工具

| 工具                       | 用途                                                                                    |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `pet_connection_state`     | 读取已保存配置、修订标识、更新中状态及实际连接状态。仅返回 `hasToken`，不返回 Token。   |
| `pet_configure_connection` | 局部修改频道配置，默认保存并连接。省略的配置字段保持原值。                              |
| `pet_connection_control`   | `connect` 连接已保存配置；`disconnect` 断开或取消连接；`stop` 请求 Anelf 停止当前会话。 |

配置示例：

```json
{
  "baseUrl": "http://127.0.0.1:8091",
  "token": "频道的 api_token",
  "userId": "desktop_pet",
  "sessionId": "companion"
}
```

先调用 `pet_connection_state`，可把返回的 `revision` 作为 `expectedRevision` 传入修改请求。修订不匹配时拒绝保存，避免覆盖界面或另一个 Agent 的编辑。此参数可省略，允许调用方有意修改最新配置。`connect:false` 表示保存并保持断开。

空 Token 或省略 Token 仅在频道地址未改变时保留现有凭据；更换地址但不提供 Token 会清除旧凭据，避免向新地址发送旧 Token。`clearToken:true` 明确清除凭据。凭据按现有系统加密方式保存，系统加密不可用时只在内存保留。

## 结果与取消

操作返回 `settings`、`revision`、`updating` 和 `connection`。连接依次经过 `connecting`、`syncing`，只有 `online` 才表示连接完成。首次连接失败返回 `error` 和具体原因，不自动重试；保存的配置仍保留，可修正后再次连接。只有已建立过的连接中断才进入 `reconnecting` 并退避恢复；认证、地址或证书错误会停止重试。配置保存成功不等于频道已连接。

配置修改和连接操作串行执行，重叠的修改会被拒绝；读取状态不受影响。显式 `disconnect` 可以打断当前连接操作。MCP SDK 的取消信号和界面“取消连接”都会关闭握手和重连；已经保存的配置不回滚，后续可重试连接。

频道正在回复时，先调用 `pet_connection_control` 的 `stop`，并读取 `busy` 确认收束，再修改配置。`disconnect` 关闭本地事件流，并不等于远端 Agent 已停止。单独停止桌宠动作继续使用 `pet_cancel`。

界面使用同一连接服务，外部修改会同步显示。若界面有未保存编辑，则保留草稿并提示载入最新配置，避免静默覆盖。

## 模块边界

- `integrations/anelf/contracts.ts`：Anelf 配置输入、脱敏状态和连接控制接口。
- `integrations/anelf/connection.ts`：并发、修订校验、连接等待、取消和关闭。
- `integrations/anelf/settings.ts`：配置存储与注入的凭据加密接口；存储格式保持版本 1。
- `integrations/anelf/client.ts`：HTTP/SSE 连接及频道会话控制。
- `integrations/anelf/mcp.ts`：把 MCP 业务工具调用和取消信号交给连接服务。
- `transports/mcp-extension.ts`：通用扩展注册点；传输实现不依赖 Anelf。
- `integrations/anelf/ui/`：Anelf 表单同步与技能说明；`renderer/panel/McpPanel.tsx` 提供通用 MCP 接入配置。
