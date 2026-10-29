# 行为预设与动作映射

行为预设描述何时回应，皮肤动作描述如何呈现。PNG、Live2D 和以后加入的组件共用同一注册与映射方式。

## 用户配置

打开轮盘的“形象”，展开“交互与行为”。每行选择一个模型动作，也可恢复皮肤默认或选择“不播放反馈”。设置按皮肤 ID 保存，切换皮肤不会互相覆盖。

当前预设有待机、触摸、拎起、放下、移动、说话以及开心、思考、困倦、惊讶。拖动的优先级高于触摸、说话和待机；手势取消会释放拖动，不触发正常放下反馈。

没有专属动作时保持模型待机，并使用轻量身体反馈。已有非静态动作时不额外套用身体动画。关闭某项反馈不影响桌面操作本身：关闭拎起反馈仍然可以拖动。关闭待机反馈会保持静止模型。显式 AI 动作始终优先，触摸不抢占；拖动仍可由用户接管。

## 注册扩展

在自己的目录中实现预设，例如 `src/behaviors/listening/index.ts`：

```ts
import type { BehaviorPreset } from '../../behavior/registry';

export const listening: BehaviorPreset = {
  id: 'listening',
  name: '倾听',
  description: '对话展示期间微微点头',
  priority: 45,
  matches: ({ signals }) => signals.has('talk'),
  feedback: {
    frames: [{}, { rotation: 2 }, {}],
    durationMs: 1800,
    loop: true,
    easing: 'smooth',
  },
};
```

在 `src/composition/behaviors.ts` 中导入并加入注册列表。界面自动增加“倾听”映射，MCP 的 `model.behaviors` 自动包含说明；核心、模型组件和消息协议无需改动。新增独立触发源时，由相应前端适配器产生信号，不在核心读鼠标、网络或系统状态。

反馈使用平台无关的位移、旋转和缩放：x/y 是模型尺寸比例，rotation 为角度，scaleX/scaleY 为比例，offset 为帧在时间轴上的位置。Web 前端适配为 DOM 动画，Unity 等平台可适配自己的变换，不需要解析 CSS。

预设 ID 唯一且稳定；重复注册会被拒绝。同优先级按照注册顺序选择。预设不导入 Electron、React、业务频道或另一个预设，不建立自己的网络调用、执行队列和取消状态。复杂辅助算法放在预设自己的目录中。

## 映射与运行时

```text
界面事件 → signals → BehaviorRegistry.resolve
                                  ↓ behavior.id
skin.bindings + 用户覆盖 → ModelSession.ambient → ModelInstance.play
                                  ↓ 无专属动作
                           前端通用反馈适配
```

`data/behaviors.json` 仅保存用户覆盖：

```json
{
  "version": 1,
  "skins": {
    "my-live2d": {
      "touch": "motion/Tap/0",
      "drag": "expression/surprised",
      "talk": ""
    }
  }
}
```

空字符串表示不播放该项反馈；非待机行为此时继续待机。删除键恢复皮肤默认。界面使用 `setBehaviors({ skinId, patch })`，patch 中 null 删除覆盖、空字符串关闭反馈、其他字符串必须是当前皮肤注册的动作。验证皮肤和行为身份后原子保存；外部皮肤文件和资源清单保持原样。

修改映射不改变模型激活 revision，也不重载 GPU 资源。活动 perform 结束后才恢复新的环境映射；查询能力可立即读取最新的 `bindings`。换肤、重新加载或更新源资源才产生新的 revision。

`ModelSession` 同时负责环境动作与显式模型动作，只有一个模型执行所有者。通用反馈在显式 perform 期间关闭；本机取消、SDK 取消、换肤与异常释放仍走既有链路。

## 验证

新预设需要覆盖触发/退出、优先级、无对应动作、重复触发和减少动画效果设置。涉及组件动作时同时验证 PNG 与 Live2D；有声音的动作要验证取消后音频停止。映射修改应在当前动作完成后生效，不通过重新挂载模型实现。
