@echo off
setlocal
set "DEST=%APPDATA%\Adobe\CEP\extensions\zidongzhiban"

echo ============================================
echo   Auto Plate-Making Panel  "Zidongzhiban"  -  Uninstall
echo ============================================
echo.
if exist "%DEST%" rmdir /S /Q "%DEST%"
if exist "%DEST%" echo       FAILED - close Illustrator and run as administrator.
if not exist "%DEST%" echo       OK - removed "%DEST%".
echo.
echo   NOTE: PlayerDebugMode registry keys are left as-is.
echo         Restart Illustrator to finish.
echo.
pause
