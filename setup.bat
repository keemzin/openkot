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

:: 1. Install dependencies
echo [1/4] Installing dependencies...
call bun install
if errorlevel 1 ( echo [!] bun install failed. & pause & exit /b 1 )
echo.

:: 2. Download OpenCode binary
echo [2/4] Downloading OpenCode binary...

:: Read OPENCODE_VERSION from .env
set OPENCODE_VERSION=1.4.3
for /f "tokens=1,2 delims==" %%A in (.env) do (
  if "%%A"=="OPENCODE_VERSION" set OPENCODE_VERSION=%%B
)
for /f "tokens=* delims= " %%A in ("%OPENCODE_VERSION%") do set OPENCODE_VERSION=%%A

echo Using OpenCode version: %OPENCODE_VERSION%

if not exist "vendor\opencode" mkdir vendor\opencode
if not exist "vendor\opencode\WORKING" mkdir vendor\opencode\WORKING

if exist "vendor\opencode\opencode.exe" (
  echo [+] opencode.exe already exists, skipping download.
) else (
  set DOWNLOAD_URL=https://github.com/anomalyco/opencode/releases/download/v%OPENCODE_VERSION%/opencode-windows-x64.zip
  echo Downloading from: !DOWNLOAD_URL!
  curl -L -o "vendor\opencode\opencode-windows-x64.zip" "!DOWNLOAD_URL!"
  if errorlevel 1 (
    echo [!] Download failed. Check your internet connection or .env OPENCODE_VERSION.
    pause & exit /b 1
  )
  echo Extracting...
  cd vendor\opencode
  tar -xf opencode-windows-x64.zip
  del opencode-windows-x64.zip
  cd ..\..
  if not exist "vendor\opencode\opencode.exe" (
    echo [!] opencode.exe not found after extraction!
    pause & exit /b 1
  )
)
echo.

:: 3. Build frontend
echo [3/4] Building frontend...
call bun run build
if errorlevel 1 ( echo [!] Build failed. & pause & exit /b 1 )
echo.

:: 4. Link CLI globally
echo [4/4] Registering openkot command globally...
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
