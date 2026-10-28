# 开发与验证

## 依赖方向

```text
HTTP / MCP / Anelf adapter
           ↓
      runtime/controller → runtime/journal
           ↓ ActionDriver
     runtime/presentation-driver
           ↓ PresentationChannel
     host/renderer-driver → preload IPC → pet/engine

host/main：组合根、生命周期、凭据、IPC 授权
host/desktop：原生窗口、显示器定位、异常恢复
host/pointer-boundary：桌面鼠标穿透与拖动捕获
host/storage：安装目录内的运行数据路径
contracts/client：桌面界面状态与操作接口
skins/catalog：数据皮肤、偏好、资源读取
renderer/pet：手势、输入气泡、动作呈现
renderer/panel：连接配置、历史、回执、外观
```

`protocol/schema.ts` 负责跨入口的协议规范。控制器不依赖 Electron、React、HTTP 或 MCP SDK；渲染器不能直接使用 Node、读取凭据文件或发网络请求。主进程只向桌宠提供必要的连接状态与外观，控制 Token 只传给设置面板。

Anelf 适配器只负责对话、连接与停止，将实时话语提交为本地气泡展示；不解析回复中的动作 JSON，也不订阅回执来发送聊天事件。`skills` 作为独立请求字段交给服务端转译。Agent 的动作经过关联 MCP 进入同一个控制器，执行回执留在工具调用内。

单击、双击、拖动集中在 `usePetGestures.ts`；AI 动作的定时器、动画帧和回答归 `pet/engine.ts` 管理；输入和提问 UI 归 `PetBubble.tsx`；图片帧播放归 `SkinSprite.tsx`。这些模块不维护各自的命令队列，唯一队列在控制器内。

`usePointerRegions.ts` 在布局与气泡尺寸变化时同步点击区域，原生边界根据系统鼠标位置切换穿透，拖动捕获具有超时。退出时停止接收窗口操作，但继续处理动作回执，待控制器完成取消后销毁窗口。

扩展动作时，在协议声明、动作执行器和能力测试中同时实现。扩展通信方式时，将已验证的消息提交给同一个控制器并给来源稳定身份，不创建另一套取消或去重状态。扩展形象时优先使用数据皮肤。

接入 Unity 等新前端时实现 `PresentationChannel` 或 `ActionDriver`，见 [前端扩展](frontends.md)。通用执行层负责回执匹配、取消超时和断线不重放，Electron 适配器只处理 IPC 和进程事件。目录初始化和安装卸载不属于核心运行时。

## 验证命令

`pnpm check` 检查 TypeScript、ESLint、单元/传输测试与生产构建。`pnpm test:e2e` 启动隔离 Electron 实例，检查窗口交互、HTTP/MCP/stdio、部分取消、进程恢复、皮肤导入和屏幕边缘布局。测试会关闭自己的窗口，并有意使一个渲染进程崩溃；正常程序不使用测试数据目录。

打包后同样可测：

```powershell
pnpm run pack
$env:EMBODIED_EXECUTABLE = "$PWD/.build/package/win-unpacked/AnelfBodied.exe"
pnpm exec playwright test
```

额外的 Anelf HTTP/HTTPS 契约验证是可选测试，需要一个现有 Anelf 源码目录及其 Python 环境：

```powershell
$env:PYTHONDONTWRITEBYTECODE = '1'
& E:/ELFProgram/AnelfAgent/.venv/Scripts/python.exe tests/fixtures/anelf_channel.py --source E:/ELFProgram/AnelfAgent --output "$PWD/.build/anelf-contract"
```

另一个终端执行：

```powershell
$env:ANELF_FIXTURE = "$PWD/.build/anelf-contract/ready.json"
$env:NODE_EXTRA_CA_CERTS = "$PWD/.build/anelf-contract/test-cert.pem"
pnpm exec playwright test
```

夹具复制必要源码与随包 Skill 到隔离目录，使用真实 Anelf HTTP 频道、技能标签加载、MCP 关联及 MCP 桥接器。确定性代理读取技能状态、激活工具组，通过桌宠 MCP 提问并取得回答，再经频道返回普通话语；它**不是实模回答质量测试**，不加载原项目凭据、记忆或数据库。HTTPS 使用仅对该测试进程信任的临时证书，不关闭证书验证。夹具五分钟后自动停止，也可创建输出目录中的 `stop` 文件结束。

`EMBODIED_DATA_DIR` 可指定隔离数据目录；`EMBODIED_PORT=0` 自动选空闲端口；`EMBODIED_TEST=1` 仅用于自动化诊断。生产默认端口为 46187。运行数据、构建产物、临时夹具和截图均不提交 Git。
