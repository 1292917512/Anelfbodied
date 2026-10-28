# 默认形象与应用图标

本版提供一个透明底 Q 版站姿和一个同形象头像图标，使用内置 imagegen 工具生成。银蓝长发、猫耳、白尾蓝尖和金蓝异瞳来自用户提供的正面、侧面、背面三张参考图；没有使用 Coopanion 的角色图片。

- 桌宠：`src/renderer/public/skins/anelf/idle.png`
- 图标：`src/renderer/public/branding/icon.png`
- 皮肤配置：`src/renderer/public/skins/anelf/manifest.json`

当前站姿为 **1 帧**，点击、移动和情绪使用客户端的通用动态反馈，不表示已经制作逐帧角色动画。后续动作可按皮肤协议增添，不改变消息协议或执行控制器。应用头像独立于可切换皮肤，用于安装程序、托盘和控制面板。

生成日期：2026-10-28。原始参考图只保存在本地工作目录，不随应用分发。以下为本次实际使用的提示词。

## 站姿

```text
Use case: stylized-concept. Asset type: a transparent full-body default sprite for the AnelfBodied desktop companion. Image 1 is the user's front character reference, image 2 the side reference, image 3 the back reference; use them for character identity only, not their reference-sheet graphics. Create ONE polished, original Q-version / chibi adaptation: approximately 2.3-head-tall, round head and short small body, soft clean anime cel shading, readable confident dark blue-gray outlines. Preserve silver-blue long hair in a few large flowing locks, two white cat ears with pale pink interiors, a fluffy white tail with light blue tip curved visibly beside the body, warm GOLD right eye (on VIEWER LEFT) and AZURE BLUE left eye (on VIEWER RIGHT). White maid-style knee-length dress and small apron with sapphire blue ribbon at collar, blue hem accents, two tiny gold buttons, white stockings and simple rounded white shoes. Simplify frills and fine trim for a desktop sprite seen at 140px tall. Cute calm attentive smile, eyes open, front-facing balanced relaxed standing pose, small hands held naturally by skirt, all limbs clearly separated. Wholesome and fully clothed, no adult proportions, no high heels. Square image with complete ears, hair, tail and shoes fully visible, centered character occupying around 88 percent of canvas height with safe transparent margins. Genuinely transparent RGBA background; no ground plane, no shadow backdrop, no text, no swatches, no layout, no logo, no other objects, no second character. The output must be one ready-to-use isolated sprite, not a character sheet.
```

## 图标

```text
Use case: stylized-concept. Asset type: square transparent application icon for AnelfBodied, matching the provided chibi desktop sprite. The input image is a character identity reference. Create one clean simplified head-and-tiny-shoulders icon of EXACTLY this same chibi cat-eared girl, face front, centered, gentle cheerful smile. Keep silver-blue bangs and long side locks, white cat ears with pale pink interiors, white maid headband and sapphire blue ribbons, GOLD eye on VIEWER LEFT, AZURE BLUE eye on VIEWER RIGHT. Use the same clean anime cel-shaded visual style but simpler broad shapes and stronger blue-gray edge definition so eyes and ears are recognizable at 24px and 32px. Face occupies most of the square, both ears entirely inside canvas with a generous clean 8 percent transparent margin. Only a tiny collar and blue bow beneath the chin; no full body, no tail, no accessories beyond the reference design. Genuinely transparent RGBA background with clean antialiased edges. No badge, no circular background, no white square, no text, no logos, no border and no extra objects. Ready-to-use Windows app and tray icon.
```
