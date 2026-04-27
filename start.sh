#!/usr/bin/env bash
set -e

echo "============================================"
echo " OpenCode Minimal UI"
echo "============================================"
echo

# Check for binary
if [ ! -f "vendor/opencode/opencode" ]; then
  echo "[!] OpenCode binary not found at vendor/opencode/opencode"
  echo "[!] Run setup-opencode.sh first or place the binary manually."
  echo
  exit 1
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  bun install
  echo
fi

echo "Starting server + frontend..."
# Starting server + frontend with wait-on
echo "Starting server in background..."
bun run dev:server &
SERVER_PID=$!

# Ensure the server is killed if the script exits
trap "kill $SERVER_PID" EXIT

echo "Waiting for server to be ready..."
bun x wait-on http://localhost:3006/health --timeout 60000 --interval 2000
echo "Server is ready. Starting frontend..."
bun run dev:frontend