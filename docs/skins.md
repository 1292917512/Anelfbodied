# 皮肤扩展

皮肤是数据，不包含 JavaScript、HTML 或插件代码。角色外观与控制协议分离：换皮肤不会改变命令 ID、取消信号或执行回执。

准备一个文件夹，在「更换形象」中导入。最简单的静态形象：

```text
my-pet/
  manifest.json
  idle.png
```

```json
{
  "version": 1,
  "id": "my-pet",
  "name": "我的伙伴",
  "author": "作者",
  "license": "资源许可证",
  "animations": {
    "idle": { "file": "idle.png", "columns": 1, "frames": 1, "fps": 1 }
  }
}
```

## 序列帧

PNG 使用规则网格，从左到右、从上到下读帧。例如 8 帧、4 列、12 fps：

```json
{ "file": "happy.png", "columns": 4, "frames": 8, "fps": 12 }
```

图片宽度需整除列数，高度需整除 `ceil(frames / columns)`。每帧保持同样的透明画布、角色位置和比例；同一皮肤不同动作也建议使用一致画布。客户端自动保持长宽比，不需要为不同屏幕重新导出。

`animations.idle` 必填。可选映射为 `touch`、`happy`、`thinking`、`sleepy`、`surprised`、`move`、`talk`。缺失动作回退到 idle，客户端保留通用的表情与触碰反馈。提供原生动作的皮肤使用自己的帧动画。系统开启减少动态效果时停止序列帧播放。

限制：每动画 1–256 帧、1–32 列、1–30 fps；每套图片总量最多 8 MB，单图最多 8192×8192 且像素总量不超过 16,777,216。只接受文件夹根目录中的 PNG，文件名由字母、数字、下划线和连字符组成；不接受路径跳转、符号链接或外部 URL。

最多导入 16 套自定义皮肤。导入复制资源到客户端数据目录，不改原始文件夹；同 ID 不覆盖，需要先移除旧副本或修改 ID。移除当前皮肤自动回到内置狐狸，原始资源不受影响。大小范围为 70%–150%，选择和大小独立于 Anelf 连接配置保存。

## 模块

- `src/skins/schema.ts`：皮肤和偏好的数据契约。
- `src/skins/catalog.ts`：验证、导入、资源白名单、切换与有界存储；不依赖 Electron。
- `src/renderer/components/SkinSprite.tsx`：静态图与网格动画播放器，供桌宠和预览复用。
- `src/renderer/panel/AppearancePanel.tsx`：形象选择、缩放和导入入口。
- `src/shared/geometry.ts`：缩放后的拖动、气泡和屏幕定位。

新增内置皮肤可放入 `src/renderer/public/skins/<id>/`，配置 ID 与目录名一致。无需修改网络层或控制器。当前内置狐狸是 1 帧占位资源；导入机制支持更多帧，不代表已经提供完整角色动画素材。
