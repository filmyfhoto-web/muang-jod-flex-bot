@echo off
rem Install the "Nong Ploy Nesting Cut" panel into Adobe Illustrator (Windows).
rem Double-click this file, then restart Illustrator.
rem (ASCII only on purpose - cmd.exe reads .cmd files with the OEM code page.)

set "SRC=%~dp0.."
set "DEST=%APPDATA%\Adobe\CEP\extensions\com.nongploy.nestingcut"

rem The panel is not signed yet: allow unsigned CEP panels (CSXS 9-12 = Illustrator 2019+)
for %%v in (9 10 11 12 13) do reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul

if exist "%DEST%" rmdir /s /q "%DEST%"
robocopy "%SRC%" "%DEST%" /E /XD install >nul
if %ERRORLEVEL% GEQ 8 (
  echo Copy failed. Close Illustrator and try again.
  pause
  exit /b 1
)

echo.
echo Installed to: %DEST%
echo Restart Illustrator, then open Window ^> Extensions ^> Nong Ploy Nesting Cut
pause