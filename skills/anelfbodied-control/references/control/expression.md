# 文字与表情

## 显示文字：say

将短信息显示在角色旁的气泡中。适合报告任务进展、提醒和结束语。以下对象放入批次的 `commands`：

```json
{ "action": "say", "text": "文件已整理完成。", "durationMs": 4000 }
```

`text` 长度 1–4000；`durationMs` 为整数，范围 300–60000，默认 6000 毫秒。长内容优先简短概述，不把日志或凭据塞进气泡。动作完成表示展示时长结束，不表示用户已阅读，也不负责执行文本中描述的任务。

## 表达情绪：emote

```json
{ "action": "emote", "name": "happy", "durationMs": 1500 }
```

可用 `name`：`neutral`、`happy`、`thinking`、`sleepy`、`surprised`。`durationMs` 范围 100–30000，默认 2000 毫秒。皮肤缺少专用帧时使用通用反馈；不能假定当前皮肤具有独立的眨眼、挥手或跳舞动画。

`emote:thinking` 只表达状态，不启动模型推理。`say` 不播放语音。当前批次逐步串行：先 `emote` 再 `say` 会先完成表情再展示文字，不能实现同时播放；不要捏造 `parallel` 参数。

需要用户回答时使用[交互](interaction.md)中的 `ask`，而不是显示问句后自行推断答案。
