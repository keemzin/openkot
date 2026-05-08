@echo off
setlocal enabledelayedexpansion

echo ============================================
echo  OpenKot Setup (Windows)
echo ============================================
echo.

:: Check Bun
where bun >nul 2>&1
if errorlevel 1 (
  echo     Bun not found. Install it first:
  echo     powershell -c "irm bun.sh/install.ps1 | iex"
  echo     Then restart your terminal and re-run this script.
  pause
  exit /b 1
)

:: Check .env
if not exist ".env" (
  if exist ".env.example" (
    echo [+] Copying .env.example to .env...
    copy ".env.example" ".env" >nul
  ) else (
    echo [!] No .env file found. Create one before continuing.
    pause & exit /b 1
  )
)

:: Check opencode config
if not exist ".opencode\opencode.jsonc" (
  if exist ".opencode\opencode .jsonc.example" (
    echo [+] Copying opencode config example to .opencode\opencode.jsonc...
    copy ".opencode\opencode .jsonc.example" ".opencode\opencode.jsonc" >nul
  )
)

:: 1. Install dependencies (includes opencode-ai binary via npm)
echo [1/3] Installing dependencies...
call bun install
if errorlevel 1 ( echo [!] bun install failed. & pause & exit /b 1 )
echo.

:: 2. Build frontend
echo [2/3] Building frontend...
call bun run build
if errorlevel 1 ( echo [!] Build failed. & pause & exit /b 1 )
echo.

:: 3. Link CLI globally
echo [3/3] Registering openkot command globally...
call bun link
if errorlevel 1 (
  echo [!] bun link failed. You can still run: start.bat
) else (
  echo [+] openkot registered! Make sure this is in your PATH:
  echo     C:\Users\%USERNAME%\.bun\bin
)

echo.
echo ============================================
echo  Setup complete!
echo ============================================
echo.
echo  From any directory:   openkot
echo  From this folder:     start.bat
echo.
pause
endlocal
