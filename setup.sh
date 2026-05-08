#!/usr/bin/env bash
set -e

echo "============================================"
echo " OpenKot Setup (Linux/Mac)"
echo "============================================"
echo

# Check Bun
if ! command -v bun &>/dev/null; then
  echo "    Bun not found. Install it first:"
  echo "    curl -fsSL https://bun.sh/install | bash"
  echo "    Then restart your terminal and re-run this script."
  exit 1
fi

# Check .env
if [ ! -f ".env" ]; then
  if [ -f ".env.example" ]; then
    echo "[+] Copying .env.example to .env..."
    cp ".env.example" ".env"
  else
    echo "[!] No .env file found. Create one before continuing."
    exit 1
  fi
fi

# Check opencode config
if [ ! -f ".opencode/opencode.jsonc" ]; then
  if [ -f ".opencode/opencode .jsonc.example" ]; then
    echo "[+] Copying opencode config example to .opencode/opencode.jsonc..."
    cp ".opencode/opencode .jsonc.example" ".opencode/opencode.jsonc"
  fi
fi

# 1. Install dependencies (includes opencode-ai binary via npm)
echo "[1/3] Installing dependencies..."
bun install
echo

# 2. Build frontend
echo "[2/3] Building frontend..."
bun run build
echo

# 3. Link CLI globally
echo "[3/3] Registering openkot command globally..."
if bun link; then
  echo "[+] openkot registered! Make sure ~/.bun/bin is in your PATH."
else
  echo "[!] bun link failed. You can still run: ./start.sh"
fi

echo
echo "============================================"
echo " Setup complete!"
echo "============================================"
echo
echo "  From any directory:   openkot"
echo "  From this folder:     ./start.sh"
echo
