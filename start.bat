@echo off
setlocal enabledelayedexpansion

echo ============================================
echo  OpenCode Minimal UI
echo ============================================
echo.

if not exist "vendor\opencode\opencode.exe" (
  echo [!] OpenCode binary not found at vendor\opencode\opencode.exe
  echo [!] Run setup-opencode.bat first or place the binary manually.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing dependencies...
  call bun install
  echo.
)

echo Starting server + frontend...
echo Starting server in background...
start /b bun run dev:server

echo Waiting for server to be ready...
bun x wait-on http://localhost:3006/health --timeout 60000 --interval 2000
echo Server is ready. Starting frontend...
bun run dev:frontend