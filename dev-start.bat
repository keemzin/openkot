@echo off
echo Starting OpenKot development servers...
echo.
echo Press Ctrl+C to stop all servers
echo.

if not exist "WORKSPACE" (
  echo [+] Creating WORKSPACE directory...
  mkdir WORKSPACE
)

bun run dev
