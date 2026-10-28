# 安装、升级与卸载

Windows x64 安装包为 `AnelfBodied-Setup-<版本>-x64.exe`。安装向导提供许可说明、安装目录选择和进度，安装完成可启动桌宠，并建立桌面、开始菜单快捷方式以及 Windows 应用卸载入口。

## 目录

```text
AnelfBodied/
  AnelfBodied.exe
  Uninstall AnelfBodied.exe
  resources/                 程序与内置资源
  locales/                   桌面运行时语言资源
  docs/                      协议、安装和二次开发说明
  examples/skins/             可直接导入的皮肤示例
  installation.ini           安装目录身份标记
  data/
    settings.json            频道设置与加密凭据
    appearance.json          皮肤和缩放偏好
    control-token            本机控制凭据
    connection.json          本机控制连接信息
    receipts.json            有界命令回执与去重记录
    skins/                   导入的皮肤与目录说明
    cache/                   Electron 会话与缓存
    logs/                    有界运行日志
    crashes/                 异常转储
    updates/                 一份更新包、校验信息与临时下载
```

Electron 还可能在 `data/` 中保存自己的本地状态文件。安装器使用当前用户模式，不要求管理员权限；请选择当前用户可写的目录。运行目录不可写时明确报错，不切换到 AppData。安装与卸载过程中操作系统会使用临时文件；快捷方式和卸载注册项属于 Windows 的正常集成，卸载时会移除。

开发运行默认使用项目根目录的 `data/`；`EMBODIED_DATA_DIR` 仅供开发、测试或明确的数据重定向。显式重定向到安装目录之外的数据不归卸载器删除。此前开发版本的 AppData 文件及其他独立副本不属于本次安装，不自动读取或清理。

## 升级

设置底部提供“检查更新 → 下载更新 → 重启并升级”。只读取本项目 GitHub Releases 的正式 Windows x64 版本；显示下载字节数与进度，支持取消，完成后校验 SHA-256。点击升级前会再次校验文件，退出前等待当前动作取消和下载句柄关闭，再运行安装器并重启。

更新包只保留一份，下载中断或取消会清理临时文件。新版本启动后清理已用的更新包；文件尚被安装器占用时短暂重试。不会自动下载或在用户未点击时退出升级。

也可关闭桌宠后直接运行新安装包。两种方式都使用原安装目录，保留 `data/` 中的凭据、皮肤和回执。安装目录不会混入构建或测试时的数据。

发布新版本需在项目 GitHub Release 中上传 `AnelfBodied-Setup-<版本>-x64.exe`，版本号与程序一致。更新器使用 [GitHub 提供的资源 SHA-256](https://docs.github.com/en/rest/releases/assets) 校验，缺少校验或地址不匹配时拒绝下载。没有新发布版本时明确显示当前状态，不修改任何配置。

## 完整卸载

在 Windows 设置的应用列表中卸载 AnelfBodied，或运行安装目录里的卸载程序。

- 删除本程序安装的文件、配置、缓存、日志、回执和自定义皮肤。
- 删除快捷方式以及安装器创建的卸载注册信息。
- 不提供默认保留数据的行为，卸载前请自行备份需要的内容。
- 不删除同目录中不属于安装包的其他文件；这种情况下目录会保留这些文件。
- 安装标记不匹配或数据文件被占用时报告失败，不把未完成的清理显示成成功。

皮肤源素材请保存在安装目录之外，通过导入复制到 `data/skins/`。不要把唯一的开发素材放在运行数据目录中。

## 验证

`pnpm run test:installer` 在项目 `.local/installer-smoke/` 下测试安装、启动、升级与卸载。为避免影响正式安装，检测到当前用户已有安装或同名快捷方式时停止。测试检查运行路径、文档、示例、升级数据保留、完整卸载、快捷方式与注册项清理，以及目录链接和无关文件的边界。

打包扩展在 `scripts/after-pack.mjs`，NSIS 定制在 `build/installer.nsh`。卸载文件清单由实际打包内容生成，避免手写文件列表与发行物不一致。定制保留 electron-builder 的标准安装器流程，使用其 [NSIS 扩展接口](https://www.electron.build/docs/nsis/)。
