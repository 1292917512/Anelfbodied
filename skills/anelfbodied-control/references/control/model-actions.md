# 当前模型的动作

通过 `pet_capabilities` 读取 `model`，不要根据皮肤名称猜测动作。`model.status` 为 `ready` 时才能执行；`loading` 表示仍在加载，`error` 的原因见 `detail`。

`model.actions` 给出当前皮肤注册的全部动作、描述、类型和建议时长。名称可以是 `idle`、`move`，也可以是任意其他名称。PNG、Live2D 和后续模型使用相同调用方式。`bindings` 表示界面事件与模型动作的关联，不是额外工具。

`model.behaviors` 提供已注册行为的 ID、名称与说明。用户可按皮肤修改映射，因此按行为选择动作前应查询最新 `bindings`；空值表示关闭该行为的专属反馈，不能传给 `perform`。映射修改不改变模型 revision，也不会中断正在执行的动作。

将查询结果中的 `name`、`model.revision` 和合适的 `durationMs` 填入批次的一步：

```json
{
  "action": "perform",
  "name": "从 model.actions 选取的名称",
  "revision": "从 model.revision 读取的值",
  "durationMs": 2000
}
```

该对象通过 `pet_execute` 的 `commands` 提交，批次结构与取消方式见[执行与恢复](execution.md)。时长为 100–120000 毫秒；动作在该展示时段内播放或保持，结束后恢复待机。完成回执表示展示时段结束，不代表播放过模型全部动作。

`perform` 中名为 `move` 的模型动作仅播放对应动画；移动桌宠位置使用通用行为 `action:"move"`。不要混淆名称与行为。

换肤或重新加载会产生新的 `revision`。旧动作正在播放时会取消，尚未执行的旧动作会失败；`model_changed` 后重新查询能力，再根据当前任务决定是否发起新操作。对结果不确定的旧批次先查询原回执，不换 ID 重播。相同 ID 的完整原批次重试仍返回原结果。

模型未提供的动作不能通过改名调用。所需动作缺失时，选择模型已有且合适的动作，或直接用话语说明；无需改写本技能来枚举模型动作。

动作可能自带语音，包含 sound 类型或关联语音的动作不需要另发朗读指令。优先使用查询返回的建议 durationMs；缩短展示时段会同时截断语音，取消和换肤也会停止语音。模型库来源不改变 MCP 调用方法。
