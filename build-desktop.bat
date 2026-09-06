@echo off
setlocal

cd /d "%~dp0"

echo Building Next Data Analyzer desktop app...
echo.

call npm run tauri build
set "BUILD_EXIT=%ERRORLEVEL%"

echo.
if "%BUILD_EXIT%"=="0" (
  echo Build completed.
  echo Installer folder: %~dp0src-tauri\target\release\bundle\nsis
  echo Executable: %~dp0src-tauri\target\release\next-data-analyzer.exe
) else (
  echo Build failed with exit code %BUILD_EXIT%.
)

echo.
pause
exit /b %BUILD_EXIT%
