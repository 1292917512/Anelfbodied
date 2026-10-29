# 皮肤与模型

本地导入的用户皮肤位于安装目录的 data/skins/<id>/；模型库皮肤在同一位置仅保存 source.json 引用，资源仍在原目录或原始模型包中。内置形象仍为银蓝猫耳单帧 PNG；Unity 酱仅用于本地验证，不随安装包分发。旧版 version:1 PNG 清单可以继续使用，读取时转换，不改写原文件。

## 导入和切换

在轮盘中打开“形象”，展开“更换形象”后可按注册的模型类型筛选、导入或切换。当前形象和大小直接展示，动作预览、行为映射、模型库与开发信息按需展开。可以直接选择含一个 .model3.json 的 Live2D runtime 文件夹，客户端自动生成清单；多个模型时用 manifest.json 指定。

加载完成才允许执行模型动作。失败时显示原因和“重新加载”入口。切换皮肤会取消旧模型动作；排队中的旧模型指令失败，不会误作用于新模型。说话、提问和桌面位置移动继续由通用行为层处理。

## 桌面大小

外观页的大小范围为 25%–1000%，100% 对应 140 个逻辑像素的显示区域。滑块按 1% 调整，也可直接输入百分比后按回车或移开焦点应用；提供 100%、200%、300%、500% 快捷按钮。面板中的预览图保持固定大小，配置作用于桌面形象。

模型与拖动坐标使用同一套尺寸计算。轮盘保持固定尺寸并在屏幕边缘避让；已经打开的编辑面板不会因缩放而移动或调整大小。过大的配置会根据当前屏幕暂时缩小，为气泡、按钮和动作效果留出空间；界面显示实际适配尺寸，保存的配置不会被改写。换到更大屏幕会恢复可用尺寸。旧版 scale 配置无需迁移。

Live2D 画布会按显示尺寸及屏幕像素密度调整分辨率，最高 2048×2048，缩放不重载模型或中断动作。PNG 的清晰度取决于素材本身的分辨率。

## PNG / 序列帧清单

```json
{
  "version": 2,
  "id": "my-pet",
  "name": "我的形象",
  "type": "png",
  "model": {
    "animations": {
      "rest": { "file": "idle.png", "frames": 1 },
      "walk": { "file": "walk.png", "columns": 4, "frames": 8, "fps": 12 }
    }
  },
  "actions": {
    "idle": { "source": "rest", "description": "安静待机" },
    "move": { "source": "walk", "description": "行走动画" }
  },
  "bindings": { "idle": "idle", "move": "move" }
}
```

网格从左到右、从上到下读帧，尺寸必须整除列数和行数。每动画 1–256 帧、1–32 列、1–60 fps。静态 PNG 不需要额外帧。

## Live2D 清单

```json
{
  "version": 2,
  "id": "my-live2d",
  "name": "我的 Live2D",
  "type": "live2d",
  "model": { "file": "runtime/model.model3.json" },
  "actions": {
    "idle": { "source": "motion/Idle/0", "description": "待机" },
    "move": { "source": "motion/Tap/0", "description": "回应触碰", "durationMs": 2000 }
  },
  "bindings": { "idle": "idle", "touch": "move" }
}
```

资源路径相对于所属文件：清单里的 file 相对皮肤目录，model3.json 的 FileReferences 相对该模型文件。支持 Cubism 3+ 的 .moc3、.model3.json、.motion3.json、.exp3.json、物理、姿态与 PNG 纹理；SDK 为官方 Cubism Web 5-r.5。Cubism 2 的 .moc 和编辑工程 .cmo3 不是运行时模型。动作中的 Sound 随动作播放一次，取消、展示时段结束或换肤时停止；支持 Chromium 可解码的 WAV、MP3、OGG，当前不提供语音口型同步。WAV 按真实长度计算建议展示时长，其余格式使用动画时长或默认 8 秒，调用方可覆盖。

不填写 actions 时，自动注册全部模型动作和表情，名称为 motion/<分组>/<从零开始的序号>、expression/<名称>。不填写绑定时，名称为 Idle 的分组第一条作为待机。名称区分大小写，请从界面或 MCP 读取实际列表。

## 模型库与 Live2DViewerEX

外观页展开“模型库”即可浏览、搜索和使用模型：

- 自动查找：读取 Steam 注册路径、libraryfolders.vdf 和常见磁盘安装目录，发现 Live2DViewerEX 安装位置及 workshop/content/616720。不会遍历整个磁盘。
- 添加目录：可选 Live2DViewerEX 安装目录、shared/workshop、Steam 创意工坊目录或普通原生模型目录。也可以添加自定义安装位置。
- 添加模型文件：支持原生 .model3.json、ViewerEX 导出 WPK、LPK。Steam LPK 需保留同目录的配套 config.json；WPK 内的配置会自动读取。
- 使用：创建只读引用并激活模型，不复制纹理、语音或模型，不生成解包目录。LPK/WPK 在内存中适配为标准 Cubism 资源视图。相同包中的同一模型跨 WPK 和 Steam 目录去重。
- 刷新：重新检索来源；模型有更新时再次点击“使用”会读取新资源并生成新的执行 revision。移除来源仅移除浏览位置；移除皮肤只删除应用内的引用，不删除原资源。

来源路径保存在 data/model-library.json。原文件被移动或磁盘离线时会提示不可用；重启时当前模型不可读则显示内置形象，保留原引用配置。添加新位置并重新使用同一模型可修复引用。

支持 STM_1_0、STD2_0 中的 Cubism 3+ 运行时数据。动作、表情与关联语音自动注册；纯语音动作也可执行。ViewerEX 的脚本、专用命令、互动选项、服装切换命令和跟踪控制器不执行，其中带独立动作/语音的部分仍可播放。界面会提示检测到的专用命令。Cubism 2、Spine、未识别或缺少配套配置的包不会假报加载成功。

每个压缩包最多 128 MB，索引最多 2048 项，声明展开总量最多 256 MB。读取时继续受单模型资源上限约束。拒绝路径跳转、重名 ZIP 项和符号链接。模型库最多 32 个来源，每个来源最多遍历 8 层、20000 项、浏览 1000 个模型。外观页分批显示搜索结果。

Live2D 清单的 model.view 可设置 zoom（0.25–4）、x/y（-2–2），默认 1/0/0；先应用模型自带 Layout，再应用该视图变换。预览区域静音，实际桌宠按动作播放语音。

## 动作与行为

- actions 为空：公开组件发现的全部动作；填写后：只公开列出的别名，source 必须存在。
- 动作名和数量不使用固定枚举。PNG 与 Live2D 共用描述、建议时长、注册和执行逻辑。
- bindings 将行为映射到动作名。当前预设包含 idle、touch、drag、drop、move、talk 和通用情绪名称，预设通过组件注册。缺少专属绑定时保持 idle 并提供轻量反馈。
- MCP 的 pet_capabilities 和 HTTP 的 /v1/capabilities 返回同一份动作清单。perform 使用 name + revision 执行模型动作。名为 move 的模型动画与 action:move 的桌面位移是两种不同操作。
- durationMs 是展示时段，范围 100–120000 毫秒；动作在时段内循环或保持，结束恢复待机。取消会停止当前效果，然后返回回执。

外观页的“交互与行为”可以覆盖当前皮肤的映射；覆盖存于 data/behaviors.json，不修改皮肤清单、Steam 资源或导出包。映射更新即时可查询，不重载模型、不改变 revision、不打断正在执行的 perform；恢复默认只移除覆盖。选择“不播放反馈”会关闭该行为的专属回应，拖动和聊天操作仍然可用。详细语义及组件开发见[行为扩展](behaviors.md)。

## 存储与扩展

每个文件最多 32 MB，每套皮肤合计最多 128 MB、2048 个资源，最多添加 16 套皮肤，已加载资源总量最多 256 MB。图片单边最多 8192、总像素不超过 16,777,216。清单最多 512 KB。支持子目录和中文文件名；拒绝外部 URL、路径跳转、符号链接及未声明的资源。皮肤是数据包，不执行其中的 JavaScript。

安装示例位于 data/skins/example-anelf/，保留许可证。覆盖升级不会覆盖用户皮肤；卸载默认保留数据，可以勾选删除。素材原件建议另外保存。

新增组件只修改自己的 src/components/<type>/ 目录，再在 src/composition/ 对应入口注册。公共接口和分层说明见 [前端与平台扩展](frontends.md)。
