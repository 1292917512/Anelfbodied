# AI 管理 Anelf 频道

这些操作通过 MCP 完成。它们修改桌宠连接到哪个 Anelf HTTP/HTTPS 频道；控制 Token、频道 API Token、WebUI 登录密码是不同凭据。只控制本机角色时，无须先配置频道。

## 读取与修改

先调用 `pet_connection_state`。结果包含 `settings`、`revision`、`updating` 和 `connection`，只返回 `hasToken`，不返回保存的频道 Token。

调用 `pet_configure_connection` 局部更新配置；下例中的地址和凭据须换成用户提供的真实频道配置：

```json
{
  "baseUrl": "https://agent.example.com",
  "token": "replace-with-channel-api-token",
  "userId": "desktop_pet",
  "sessionId": "companion",
  "connect": true
}
```

将刚读取的 `revision` 作为 `expectedRevision` 加入请求可以避免覆盖其他入口的编辑。冲突时读取最新配置并按任务意图重新判断，不通过去掉校验强行覆盖。用户明确要覆盖最新配置时，可以省略该参数。

| 字段               | 含义                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `baseUrl`          | HTTP API 频道基础 URL；允许 HTTP/HTTPS，不带 URL 用户密码、查询参数或片段；不是 WebUI 页面地址 |
| `token`            | 频道 API Token，最多 4096 字符                                                                 |
| `userId`           | 1–128 字符，不含空白或 `#`                                                                     |
| `sessionId`        | 1–128 字符，是 Anelf 会话标识，不是动作批次的 `session`                                        |
| `clearToken`       | `true` 明确清除已保存的频道凭据                                                                |
| `connect`          | 默认 `true`；`false` 保存后保持断开                                                            |
| `expectedRevision` | 本次编辑基于的修订标识，可省略                                                                 |

省略配置字段保持原值；空 Token 或省略 Token 仅在地址不变时保留已有凭据。更换地址但不提供 Token 会清除旧凭据，避免向新地址发送它。系统加密不可用时 Token 仅保留在内存。

同一时刻只允许一个配置或连接操作；`updating:true` 时等待当前操作结束，不能高频提交。频道 `busy:true` 时不允许修改配置。如任务确实需要中断当前会话，先停止再确认 `busy:false`；否则等待本轮结束。

## 连接、停止与取消

传给 `pet_connection_control`：

```json
{ "action": "connect" }
```

`connect` 使用已保存配置；`disconnect` 关闭本地频道流，也能打断尚未完成的连接；`stop` 请求 Anelf 停止当前会话并取消该频道的本机动作。`disconnect` 不证明远端 Agent 已停止，也不会取消其他入口的桌宠任务；本机 MCP/HTTP 批次使用 `pet_cancel`。

只有返回 `connection.status:"online"` 才确认连接完成。`connecting` 和 `syncing` 分别表示连接服务和同步历史，操作仍在等待。首次失败返回 `error`，检查 `detail`、地址、服务状态和凭据后再重试。`reconnecting` 仅用于恢复曾建立过的连接；保存配置成功不等于已连通。停止请求返回后仍可能收束中，读取 `busy` 确认结果，不把请求已送达写成停止已完成。

MCP SDK 取消或显式断开会中断连接尝试；已保存的设置不会回滚。先查询状态，再决定是否用已保存配置重新连接。配置变化会同步到界面；界面存在未保存草稿时会显示冲突提示。
