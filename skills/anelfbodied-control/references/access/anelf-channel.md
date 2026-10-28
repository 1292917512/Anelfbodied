# Anelf 频道、技能标签与 MCP

Anelf 频道负责对话，关联 MCP 负责动作和执行回执。一次任务可以先调用工具移动、表达情绪或向用户提问，再通过频道回复普通话语；不要求整轮回答是 JSON。

## 技能选择

在目标 Anelf 服务安装整个 `anelfbodied-control` 文件夹，并在桌宠频道设置中填写该服务实际存在的技能名称。桌宠发送 `/api/chat` 时，`message` 是原始话语，另传 `skills: ["anelfbodied-control"]`。Anelf 将该字段转为内部技能标签，再加载 `SKILL.md` 正文与技能关联的 MCP 状态。不要手动在消息里重复拼接 `[skill:...]` 或操作提示。

技能名称留空时不传 `skills`。客户端不上传文件，也不安装服务端技能；频道连接成功不证明 Skill 已存在或 MCP 已就绪。服务端只自动展开入口正文，引用文件由 Agent 按需读取。

## 服务端绑定

1. 在桌宠设置的「MCP / 消息协议」中取得连接配置，将它配置到运行 Anelf Agent 的 MCP 客户端。凭据只放在 MCP 配置中。
2. 用 `list_mcp_servers` 查询实际服务名，确认它对应用户指定的桌宠，再调用 `set_skill_mcp_servers(name="anelfbodied-control", server_names=[实际服务名])`。列表会替换该技能原有的完整关联，已有其他关联时一并保留；空列表表示清除。
3. 关联存于 Anelf 的技能账本，不是 `SKILL.md` frontmatter 字段，也不会自动连接 MCP。任务执行时根据技能附带的状态，按需调用 `connect_mcp_server`，并通过 `activate_tool_group(group="mcp:实际服务名")` 激活工具组。
4. 首次调用读取 `pet_capabilities`，随后按本次任务使用 `pet_execute`、`pet_state` 和 `pet_cancel`。工具名可能带宿主前缀，以实际注册工具为准。

桌宠 MCP 默认只监听本机回环地址。远端 Anelf 不能直接访问用户电脑的 `127.0.0.1`；需要事先配置可达且受认证保护的连接方式。技能关联本身不建立隧道，也不改变监听范围。无法访问时说明原因，不猜测 Token 或把频道回复改成控制协议。

## 话语、动作和回执

- `pet_execute` 的参数使用 `desktop-pet/1` 批次结构。为任务生成 `session`，不依赖频道内部会话值；参数规则见[执行与恢复](../control/execution.md)。
- `ask` 的用户回答来自 MCP 工具回执。收到真实回答后可以继续执行工具，再用普通话语回复用户。不向 `/api/chat` 再发送一份回执事件。
- 频道回复仅作为文字显示；即使内容形似动作 JSON，也不会执行。最终话语自动显示气泡，避免用 `say` 再重复同一句内容。
- MCP 不可用或动作失败时，说明实际状态；不要把“已受理”或网络断开当作执行成功。

## 停止与恢复

频道 SSE 断线会按连接策略重连、同步历史，但不从历史执行动作。MCP 调用结果不确定时先用原 ID 查询回执，不换 ID 自动重播。用户界面停止会取消本机活动动作并请求 Anelf 当前会话停止；Agent 主动取消使用 `pet_cancel`，远端推理停止见[频道管理](../control/connection.md)。
