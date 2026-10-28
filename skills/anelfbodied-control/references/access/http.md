# 本机 HTTP 控制

使用设置页提供的本机基础 URL 和控制 Token。服务监听 `127.0.0.1`，默认端口为 `46187`；全部端点都要求 Bearer 认证。来自网页的带 `Origin` 请求会被拒绝，应使用 Agent 的 HTTP 工具或本机运行时，不在浏览器页面中注入请求。

| 请求                   | 用途                                               |
| ---------------------- | -------------------------------------------------- |
| `GET /v1/capabilities` | 读取当前动作能力                                   |
| `POST /v1/commands`    | 发送完整批次；返回 HTTP 202 和当前回执             |
| `GET /v1/receipts/:id` | 查询一批的回执；不存在时为 404                     |
| `GET /v1/receipts`     | `{receipts:[...]}`，最多最近 100 条                |
| `POST /v1/cancel`      | 按 `id` 或 `session` 取消，返回 `{receipts:[...]}` |

JSON 请求设置 `Content-Type: application/json`。HTTP 202 只表示受理；即使 HTTP 请求已结束，动作仍可能运行。频道配置工具位于 MCP，没有 `/v1/configure`、`/v1/settings` 或其他 HTTP 配置端点。

## 最小提交示例

以下 Node.js 示例读取调用方已有的环境变量，不在文件中保存凭据。只有明确使用此入口时才运行。它只提交一次并查询当前状态，不自动重试：

```js
const base = process.env.EMBODIED_URL;
const token = process.env.EMBODIED_TOKEN;
if (!base || !token) throw new Error('缺少桌宠连接配置');
const headers = {
  Authorization: `Bearer ${token}`,
  'Content-Type': 'application/json',
};
const batch = {
  protocol: 'desktop-pet/1',
  id: crypto.randomUUID(),
  session: crypto.randomUUID(),
  expiresAt: Date.now() + 120000,
  commands: [{ action: 'say', text: '我在这里。', durationMs: 2000 }],
};
const response = await fetch(new URL('/v1/commands', base), {
  method: 'POST',
  headers,
  body: JSON.stringify(batch),
});
if (!response.ok) throw new Error(`提交失败：HTTP ${response.status}`);
console.log(await response.json());
const state = await fetch(new URL(`/v1/receipts/${encodeURIComponent(batch.id)}`, base), {
  headers,
});
if (!state.ok) throw new Error(`查询失败：HTTP ${state.status}`);
console.log(await state.json());
```

提交前保留完整 `batch`，以便网络不确定时用同一 ID 查询。需要等待最终结果时，对 `accepted` 或 `running` 按约 0.5–2 秒间隔查询，直到终态或既定任务期限；不要无限轮询或重新生成 ID 重发。期限到达但仍无法确认时，按[执行与恢复](../control/execution.md)取消并报告实际状态。

401：核对本机控制 Token；403：核对回环主机和请求来源；409：检查 `id_conflict` 或 `session_cancelled`；422：检查字段和有效期；429：等待队列或存储容量释放，不能通过更换 ID 清空限制。其他连接错误先恢复连接并查询原回执。
