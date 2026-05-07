@echo off
echo Stopping OpenKot development servers...
echo.

REM Kill processes on common ports
call :killPort 5173 "Vite"
call :killPort 3006 "Express"
call :killPort 3358 "OpenCode"

echo.
echo Killing any remaining bun/opencode processes...
taskkill /F /IM bun.exe >nul 2>&1
taskkill /F /IM opencode.exe >nul 2>&1

echo.
echo All development servers stopped!
echo You can now run "bun run dev" again.
echo.
pause
exit /b

:killPort
set PORT=%1
set NAME=%2
echo Checking %NAME% on port %PORT%...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%PORT%" ^| findstr "LISTENING"') do (
    echo   Killing process %%a
    taskkill /F /PID %%a >nul 2>&1
)
exit /b
