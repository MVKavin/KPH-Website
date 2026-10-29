@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found. Install Node.js 18 or newer from https://nodejs.org/ and run this file again.
  pause
  exit /b 1
)
if not exist .env (
  copy .env.example .env >nul
  echo A new .env file was created. Change ADMIN_PASSWORD and SESSION_SECRET before continuing.
  start /wait notepad .env
)
if not exist node_modules (
  echo Installing website dependencies. This requires an internet connection the first time.
  call npm install
  if errorlevel 1 (
    echo Dependency installation failed. Check your internet connection and Node.js installation.
    pause
    exit /b 1
  )
)
echo Starting KPH at http://localhost:3000
call npm start
pause
