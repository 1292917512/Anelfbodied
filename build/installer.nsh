!include LogicLib.nsh

!macro customInstallMode
  StrCpy $isForceCurrentInstall "1"
!macroend

!macro customInit
  StrCpy $hasPerMachineInstallation "0"
  StrCpy $hasPerUserInstallation "1"
  !insertmacro setInstallModePerUser
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TEXT "安装程序将创建快捷方式并注册卸载入口。$\r$\n$\r$\n程序、配置、缓存和皮肤保存在所选安装目录中。请使用当前用户可写的目录。$\r$\n$\r$\n卸载将永久删除本程序的数据。二次开发的源素材请保存在安装目录之外。"
  !insertmacro MUI_PAGE_WELCOME
!macroend

!macro customInstall
  CreateDirectory "$INSTDIR\data\skins"
  IfFileExists "$INSTDIR\data\skins\README.md" +2 0
    CopyFiles /SILENT "$INSTDIR\docs\skins.md" "$INSTDIR\data\skins\README.md"
  WriteINIStr "$INSTDIR\installation.ini" "Embodied" "AppId" "${APP_ID}"
  Delete "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}"
  ${GetParent} "$LOCALAPPDATA\${APP_INSTALLER_STORE_FILE}" $R0
  RMDir "$R0"
!macroend

!macro customUnWelcomePage
  !define MUI_UNWELCOMEPAGE_TEXT "卸载将删除程序、配置、缓存、日志、回执和导入的皮肤，并移除快捷方式及卸载注册信息。$\r$\n$\r$\n数据不会保留，请先备份需要的内容。"
  !insertmacro MUI_UNPAGE_WELCOME
!macroend

!macro customRemoveFiles
  ReadINIStr $R0 "$INSTDIR\installation.ini" "Embodied" "AppId"
  ${If} $R0 != "${APP_ID}"
    MessageBox MB_ICONSTOP|MB_OK "安装目录校验失败，已停止清理。"
    SetErrorLevel 2
    Abort
  ${EndIf}
  SetOutPath $TEMP
  !include "${BUILD_RESOURCES_DIR}\.generated\uninstall-files.nsh"
  ${IfNot} ${isUpdated}
    Push "$INSTDIR\data"
    Call un.RemoveOwnedTree
    IfFileExists "$INSTDIR\data\*.*" 0 +4
      MessageBox MB_ICONSTOP|MB_OK "数据文件仍被占用，请关闭桌宠后重试卸载。"
      SetErrorLevel 2
      Abort
  ${EndIf}
  Delete "$INSTDIR\installation.ini"
  Delete "$INSTDIR\${UNINSTALL_FILENAME}"
  RMDir "$INSTDIR"
!macroend

!ifdef BUILD_UNINSTALLER
; Removes directory links without traversing their targets.
Function un.RemoveOwnedTree
  Exch $0
  Push $1
  Push $2
  Push $3
  System::Call 'kernel32::GetFileAttributesW(w r0) i.r1'
  IntOp $1 $1 & 0x400
  ${If} $1 == 0
    FindFirst $2 $3 "$0\*.*"
    owned_loop:
      StrCmp $3 "" owned_done
      StrCmp $3 "." owned_next
      StrCmp $3 ".." owned_next
      System::Call 'kernel32::GetFileAttributesW(w "$0\$3") i.r1'
      IntOp $1 $1 & 0x10
      ${If} $1 != 0
        Push "$0\$3"
        Call un.RemoveOwnedTree
      ${Else}
        Delete "$0\$3"
      ${EndIf}
    owned_next:
      FindNext $2 $3
      Goto owned_loop
    owned_done:
      FindClose $2
  ${EndIf}
  RMDir "$0"
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd
!endif
