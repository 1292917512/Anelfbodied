!include LogicLib.nsh

!macro customHeader
  !include "${BUILD_RESOURCES_DIR}\uninstall-data.nsh"
  !include "${BUILD_RESOURCES_DIR}\uninstall-checks.nsh"
!macroend

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customInit
  StrCpy $hasPerMachineInstallation "0"
  StrCpy $hasPerUserInstallation "1"
  !insertmacro setInstallModePerUser
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TEXT "在桌面与你的 AI 伙伴交流。$\r$\n$\r$\n程序、配置和皮肤集中保存在所选目录中，请使用当前用户可写的目录。$\r$\n$\r$\n覆盖安装会保留数据。卸载时默认保留，也可勾选删除。"
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customInstall
  CreateDirectory "$INSTDIR\data\skins"
  CopyFiles /SILENT "$INSTDIR\docs\skins.md" "$INSTDIR\data\skins\README.md"
  IfFileExists "$INSTDIR\data\skins\example-anelf" skin_example_ready
    SetOutPath "$INSTDIR\data\skins\example-anelf"
    File /oname=manifest.json "${BUILD_RESOURCES_DIR}\..\.build\nsis\example-manifest.json"
    File "${BUILD_RESOURCES_DIR}\..\src\renderer\public\skins\anelf\idle.png"
    File "${BUILD_RESOURCES_DIR}\..\src\renderer\public\skins\anelf\LICENSE.txt"
  skin_example_ready:
  SetOutPath "$INSTDIR"
  WriteINIStr "$INSTDIR\installation.ini" "Embodied" "AppId" "${APP_ID}"
  Delete "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
  ${GetParent} "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}" $R0
  RMDir "$R0"
!macroend

!macro customUnWelcomePage
  !define MUI_UNWELCOMEPAGE_TEXT "卸载将移除程序、快捷方式和 Windows 卸载入口。$\r$\n$\r$\n默认保留配置、皮肤与其他用户数据，之后安装到同一目录即可继续使用。$\r$\n$\r$\n下一步可以选择同时删除这些数据。"
  !insertmacro MUI_UNPAGE_WELCOME
  UninstPage custom un.DataOptionsCreate un.DataOptionsLeave
!macroend

!macro customUninstallPage
  !define MUI_UNFINISHPAGE_TEXT "$dataDisposition$\r$\n$\r$\n程序、快捷方式和卸载信息已移除。"
!macroend

!macro customRemoveFiles
  ReadINIStr $R0 "$INSTDIR\installation.ini" "Embodied" "AppId"
  ${If} $R0 != "${APP_ID}"
    MessageBox MB_ICONSTOP|MB_OK "安装目录校验失败，已停止清理。" /SD IDOK
    SetErrorLevel 2
    Abort
  ${EndIf}
  SetOutPath $TEMP
  ${IfNot} ${isUpdated}
  ${AndIf} $removeUserData == ${BST_CHECKED}
    StrCpy $deletingData 0
    Push "$INSTDIR\data"
    Call un.VisitDataTree
  ${EndIf}
  !include "${BUILD_RESOURCES_DIR}\..\.build\nsis\uninstall-files.nsh"
  StrCpy $dataDisposition "用户数据保留在：$\r$\n$INSTDIR\data$\r$\n$\r$\n重新安装到同一目录即可继续使用。"
  ${IfNot} ${isUpdated}
  ${AndIf} $removeUserData == ${BST_CHECKED}
    StrCpy $deletingData 1
    Push "$INSTDIR\data"
    Call un.VisitDataTree
    IfFileExists "$INSTDIR\data\*.*" 0 +4
      MessageBox MB_ICONSTOP|MB_OK "数据文件仍被占用，请关闭桌宠后重试卸载。" /SD IDOK
      SetErrorLevel 2
      Abort
    StrCpy $dataDisposition "用户数据已按你的选择删除。"
  ${EndIf}
  Delete "$INSTDIR\installation.ini"
  Delete "$INSTDIR\${UNINSTALL_FILENAME}"
  RMDir "$INSTDIR"
!macroend
