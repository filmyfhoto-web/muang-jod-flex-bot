@echo off
setlocal EnableExtensions
rem Install the "NudPon Nesting Cut" panel into Adobe Illustrator (Windows).
rem Double-click this file, then restart Illustrator.
rem (ASCII only on purpose - cmd.exe reads .cmd files with the OEM code page.)

set "ID=com.nongploy.nestingcut"
set "SRC=%~dp0.."
set "BASE=%APPDATA%\Adobe\CEP\extensions"
set "DEST=%BASE%\%ID%"

rem The panel is not signed yet: allow unsigned CEP panels (CSXS 9-14 = Illustrator 2019+)
for %%v in (9 10 11 12 13 14) do reg add "HKCU\Software\Adobe\CSXS.%%v" /v PlayerDebugMode /t REG_SZ /d 1 /f >nul

rem Remove older copies of this panel in other folders - otherwise Illustrator may keep loading an old one
for %%S in ("%BASE%" "%CommonProgramFiles%\Adobe\CEP\extensions" "%CommonProgramFiles(x86)%\Adobe\CEP\extensions") do (
  if exist "%%~S" (
    for /d %%D in ("%%~S\*") do (
      if exist "%%~D\CSXS\manifest.xml" (
        findstr /c:"%ID%" "%%~D\CSXS\manifest.xml" >nul 2>&1 && (
          rmdir /s /q "%%~D" 2>nul
          if exist "%%~D" echo WARNING: old copy at "%%~D" - delete it as administrator, then run this again
        )
      )
    )
  )
)

rem Clear the panel cache so the new version shows up right away
if exist "%TEMP%\cep_cache" for /d %%C in ("%TEMP%\cep_cache\*nestingcut*") do rmdir /s /q "%%~C" 2>nul

robocopy "%SRC%" "%DEST%" /E /XD install >nul
if %ERRORLEVEL% GEQ 8 (
  echo Copy failed. Close Illustrator and try again.
  pause
  exit /b 1
)

echo.
echo Installed to: %DEST%
findstr /c:"ExtensionBundleVersion" "%DEST%\CSXS\manifest.xml"
echo Close Illustrator completely, open it again, then Window ^> Extensions ^> NudPon Nesting Cut
echo The version number is shown at the bottom right of the panel.
pause
