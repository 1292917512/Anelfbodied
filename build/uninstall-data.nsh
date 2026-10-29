!ifdef BUILD_UNINSTALLER
!include nsDialogs.nsh

Var removeUserData
Var removeDataCheckbox
Var dataDisposition
Var deletingData

!macro customUnInit
  StrCpy $removeUserData ${BST_UNCHECKED}
  ${IfNot} ${isUpdated}
    ClearErrors
    ${GetParameters} $R0
    ${GetOptions} $R0 "/DELETEUSERDATA" $R1
    ${IfNot} ${Errors}
      StrCpy $removeUserData ${BST_CHECKED}
    ${EndIf}
    ClearErrors
  ${EndIf}
!macroend

Function un.DataOptionsCreate
  ${If} ${isUpdated}
    Abort
  ${EndIf}
  !insertmacro MUI_HEADER_TEXT "用户数据" "选择卸载后是否保留配置与皮肤。"
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}
  ${NSD_CreateLabel} 0 0 100% 45u "默认保留用户数据，重新安装到同一目录后可以继续使用。$\r$\n$\r$\n数据目录：$INSTDIR\data"
  Pop $0
  ${NSD_CreateCheckbox} 0 60u 100% 20u "同时删除用户数据（配置、皮肤、回执、缓存和日志）"
  Pop $removeDataCheckbox
  ${NSD_SetState} $removeDataCheckbox $removeUserData
  ${NSD_CreateLabel} 0 90u 100% 35u "勾选后将永久删除此数据目录，请先备份需要的内容。目录之外的文件不会被删除。"
  Pop $0
  nsDialogs::Show
FunctionEnd

Function un.DataOptionsLeave
  ${NSD_GetState} $removeDataCheckbox $removeUserData
FunctionEnd

; Checks or removes data without traversing directory links.
Function un.VisitDataTree
  Exch $0
  Push $1
  Push $2
  Push $3
  ${If} $deletingData == 0
    Push $0
    Call un.CheckDeletable
  ${EndIf}
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
        Call un.VisitDataTree
      ${Else}
        ${If} $deletingData == 0
          Push "$0\$3"
          Call un.CheckDeletable
        ${Else}
          Delete "$0\$3"
        ${EndIf}
      ${EndIf}
    owned_next:
      FindNext $2 $3
      Goto owned_loop
    owned_done:
      FindClose $2
  ${EndIf}
  ${If} $deletingData == 1
    RMDir "$0"
  ${EndIf}
  Pop $3
  Pop $2
  Pop $1
  Pop $0
FunctionEnd
!endif
