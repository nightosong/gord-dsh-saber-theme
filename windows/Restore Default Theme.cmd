@echo off
setlocal
cd /d "%~dp0.."
node scripts\manage.mjs uninstall %*
if errorlevel 1 (
  pause
  exit /b 1
)
echo Done. Reopen DeepSeek Harness.
pause
