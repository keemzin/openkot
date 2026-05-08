#!/usr/bin/env bash
echo "Starting OpenKot development servers..."
echo
echo "Press Ctrl+C to stop all servers"
echo

if [ ! -d "WORKSPACE" ]; then
  echo "[+] Creating WORKSPACE directory..."
  mkdir -p WORKSPACE
fi

bun run dev
