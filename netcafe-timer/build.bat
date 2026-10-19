@echo off
rem Build NetTimer.exe with the C# compiler that ships with Windows (.NET Framework 4)
setlocal
cd /d "%~dp0"
set CSC=%WINDIR%\Microsoft.NET\Framework64\v4.0.30319\csc.exe
if not exist "%CSC%" set CSC=%WINDIR%\Microsoft.NET\Framework\v4.0.30319\csc.exe
if not exist "%CSC%" (
  echo [ERROR] .NET Framework 4 not found. Please install .NET Framework 4.x
  pause
  exit /b 1
)
"%CSC%" /nologo /target:winexe /optimize+ /codepage:65001 /out:NetTimer.exe /r:System.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:System.Xml.dll src\Core.cs src\App.cs
if errorlevel 1 (
  echo [ERROR] Build failed
  pause
  exit /b 1
)
echo Build OK: NetTimer.exe
pause
