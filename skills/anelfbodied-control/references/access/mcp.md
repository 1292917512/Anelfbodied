# MCP 接入

## 首次连接

先启动 AnelfBodied。在“连接设置 → MCP / 消息协议 → 复制 MCP 配置”取得本机地址与认证头，将配置加入 Agent 的 MCP 客户端。地址通常是 `http://127.0.0.1:46187/mcp`，但应使用实际配置中的端口。

服务采用 Streamable HTTP，仅监听本机回环地址，需要 `Authorization: Bearer <控制 Token>`。此 Token 与 Anelf 频道的 API Token 不同；用户可通过手动接入说明提供它，只将其用于 MCP 配置，不在回复中复述，也不写入 Skill、命令日志或版本库。缺少地址或凭据时获取正确配置，不猜测，也不读取其他应用的凭据。

远端 Agent 的 `127.0.0.1` 指向远端机器，不能直接访问用户电脑。当前文档只说明本机接入；跨主机转发需要独立的部署方案，Skill 不会自动开放网络监听。

只支持 stdio 的宿主可使用源码构建生成的 `dist/host/stdio.js` 网关，传入 `EMBODIED_URL`（基础 URL，不带 `/mcp`）和 `EMBODIED_TOKEN`。网关通过 Node.js 运行并连接已启动的桌宠；安装包未提供独立的 Node 命令行运行时或外置 stdio 文件，不应猜测安装目录内的脚本路径。普通安装版优先使用 Streamable HTTP。

## 工具选择

| 工具                       | 输入                                                     | 结果                                      |
| -------------------------- | -------------------------------------------------------- | ----------------------------------------- |
| `pet_capabilities`         | 无参数                                                   | 协议、动作 Schema 和限制                  |
| `pet_execute`              | 完整 `desktop-pet/1` 批次对象                            | 等待批次结束，返回回执                    |
| `pet_state`                | `{}` 或 `{"id":"command-id"}`                            | `{receipts:[...]}`，只查询，不执行        |
| `pet_cancel`               | `{"id":"command-id"}` 或 `{"session":"task-session-id"}` | 等待本机动作停止，返回 `{receipts:[...]}` |
| `pet_connection_state`     | 无参数                                                   | 脱敏频道设置、修订号与连接状态            |
| `pet_configure_connection` | 部分频道配置                                             | 保存并默认连接，返回实际状态              |
| `pet_connection_control`   | `{"action":"connect"}`、`disconnect` 或 `stop`           | 连接、断开或请求频道会话停止              |

`pet_execute` 的输入直接是批次对象，不要包在 `command`、`payload` 或 `message` 字段中。批次构造见[执行与恢复](../control/execution.md)，频道配置见[频道管理](../control/connection.md)。

成功工具结果同时提供 `structuredContent` 与 JSON 文本内容；优先读取 `structuredContent`。先检查 MCP 的 `isError`，工具调用失败不等于动作回执为 `failed`，也不证明此前动作没有发生。

## 等待与重连

为 `pet_execute` 设置覆盖排队和动作时长的客户端超时，避免宿主默认的短超时中断 `ask`。整个批次最多有效五分钟；长流程拆成多个有回执的短批次，不以并发提交绕过队列。

MCP SDK 的取消信号会触发本机动作取消。调用方取消或网络中断后仍应通过 `pet_state` 查询最终状态；关闭传输连接本身不是停止所有动作的可靠证明。

MCP 会话闲置十五分钟会释放。服务报告会话不存在时重新初始化，再查询原命令 ID。MCP 的传输会话 ID 与命令中的 `session` 是两种标识，不能互相替换。HTTP 与 MCP 共用外部命令身份，同一批任务跨这两个入口重试时仍保持原始批次不变。
