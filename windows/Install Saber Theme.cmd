@echo off
setlocal
cd /d "%~dp0.."
where node >nul 2>&1
if errorlevel 1 (
  echo Node.js 22+ is required. Install Node.js and try again.
  pause
  exit /b 1
)
echo Close DeepSeek Harness before installation. Existing settings will be backed up.
node scripts\manage.mjs install %*
if errorlevel 1 (
  pause
  exit /b 1
)
echo Done. Reopen DeepSeek Harness.
pause
