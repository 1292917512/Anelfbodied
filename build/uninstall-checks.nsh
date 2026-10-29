!ifdef BUILD_UNINSTALLER
; Checks all installed paths before removing any application files.
Function un.CheckOwnedDirectory
  Exch $0
  Push $1
  System::Call 'kernel32::GetFileAttributesW(w r0) i.r1'
  ${If} $1 != -1
    IntOp $1 $1 & 0x400
    ${If} $1 != 0
      MessageBox MB_ICONSTOP|MB_OK "程序目录被替换为链接，已停止卸载以保护外部文件：$\r$\n$0" /SD IDOK
      SetErrorLevel 2
      Abort
    ${EndIf}
  ${EndIf}
  Pop $1
  Pop $0
FunctionEnd

Function un.CheckDeletable
  Exch $0
  Push $1
  IfFileExists "$0" 0 checked
  System::Call 'kernel32::CreateFileW(w r0, i 0x10000, i 7, p 0, i 3, i 0x2200000, p 0) p.r1'
  ${If} $1 == -1
    MessageBox MB_ICONSTOP|MB_OK "文件被占用或无法删除，已停止卸载。请关闭相关程序后重试：$\r$\n$0" /SD IDOK
    SetErrorLevel 2
    Abort
  ${EndIf}
  System::Call 'kernel32::CloseHandle(p r1)'
  checked:
  Pop $1
  Pop $0
FunctionEnd
!endif
