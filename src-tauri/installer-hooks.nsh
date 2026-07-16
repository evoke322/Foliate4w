; Register Foliate as an "Open with" candidate without changing the current
; default handler stored on each extension.

!define FOLIATE_PROGID "Foliate4w.Book"

!macro FOLIATE_REGISTER_TYPE EXT
  WriteRegStr SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${FOLIATE_PROGID}" ""
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\SupportedTypes" ".${EXT}" ""
!macroend

!macro FOLIATE_UNREGISTER_TYPE EXT
  DeleteRegValue SHCTX "Software\Classes\.${EXT}\OpenWithProgids" "${FOLIATE_PROGID}"
  DeleteRegKey /ifempty SHCTX "Software\Classes\.${EXT}\OpenWithProgids"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  WriteRegStr SHCTX "Software\Classes\${FOLIATE_PROGID}" "" "Foliate e-book"
  WriteRegStr SHCTX "Software\Classes\${FOLIATE_PROGID}\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr SHCTX "Software\Classes\${FOLIATE_PROGID}\shell" "" "open"
  WriteRegStr SHCTX "Software\Classes\${FOLIATE_PROGID}\shell\open" "" "Open with ${PRODUCTNAME}"
  WriteRegStr SHCTX "Software\Classes\${FOLIATE_PROGID}\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""

  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe" "FriendlyAppName" "${PRODUCTNAME}"
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\DefaultIcon" "" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  WriteRegStr SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe\shell\open\command" "" "$\"$INSTDIR\${MAINBINARYNAME}.exe$\" $\"%1$\""

  !insertmacro FOLIATE_REGISTER_TYPE "epub"
  !insertmacro FOLIATE_REGISTER_TYPE "mobi"
  !insertmacro FOLIATE_REGISTER_TYPE "azw"
  !insertmacro FOLIATE_REGISTER_TYPE "azw3"
  !insertmacro FOLIATE_REGISTER_TYPE "fb2"
  !insertmacro FOLIATE_REGISTER_TYPE "fbz"
  !insertmacro FOLIATE_REGISTER_TYPE "zip"
  !insertmacro FOLIATE_REGISTER_TYPE "cbz"
  !insertmacro FOLIATE_REGISTER_TYPE "pdf"
  !insertmacro UPDATEFILEASSOC
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  !insertmacro FOLIATE_UNREGISTER_TYPE "epub"
  !insertmacro FOLIATE_UNREGISTER_TYPE "mobi"
  !insertmacro FOLIATE_UNREGISTER_TYPE "azw"
  !insertmacro FOLIATE_UNREGISTER_TYPE "azw3"
  !insertmacro FOLIATE_UNREGISTER_TYPE "fb2"
  !insertmacro FOLIATE_UNREGISTER_TYPE "fbz"
  !insertmacro FOLIATE_UNREGISTER_TYPE "zip"
  !insertmacro FOLIATE_UNREGISTER_TYPE "cbz"
  !insertmacro FOLIATE_UNREGISTER_TYPE "pdf"
  DeleteRegKey SHCTX "Software\Classes\Applications\${MAINBINARYNAME}.exe"
  DeleteRegKey SHCTX "Software\Classes\${FOLIATE_PROGID}"
  !insertmacro UPDATEFILEASSOC
!macroend
