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

# 1. Install dependencies
echo "[1/4] Installing dependencies..."
bun install
echo

# 2. Download OpenCode binary
echo "[2/4] Downloading OpenCode binary..."

# Read OPENCODE_VERSION from .env
OPENCODE_VERSION="1.4.3"
if grep -q "^OPENCODE_VERSION=" .env; then
  OPENCODE_VERSION=$(grep "^OPENCODE_VERSION=" .env | cut -d'=' -f2 | tr -d '[:space:]')
fi
echo "Using OpenCode version: $OPENCODE_VERSION"

mkdir -p vendor/opencode

if [ -f "vendor/opencode/opencode" ]; then
  echo "[+] opencode binary already exists, skipping download."
else
  # Detect OS and arch
  OS=$(uname -s | tr '[:upper:]' '[:lower:]')
  ARCH=$(uname -m)

  case "$OS" in
    linux)
      case "$ARCH" in
        x86_64)  BINARY="opencode-linux-x64" ;;
        aarch64) BINARY="opencode-linux-arm64" ;;
        *)       echo "[!] Unsupported arch: $ARCH"; exit 1 ;;
      esac
      ;;
    darwin)
      case "$ARCH" in
        x86_64)  BINARY="opencode-darwin-x64" ;;
        arm64)   BINARY="opencode-darwin-arm64" ;;
        *)       echo "[!] Unsupported arch: $ARCH"; exit 1 ;;
      esac
      ;;
    *)
      echo "[!] Unsupported OS: $OS"
      exit 1
      ;;
  esac

  DOWNLOAD_URL="https://github.com/anomalyco/opencode/releases/download/v${OPENCODE_VERSION}/${BINARY}.zip"
  echo "Downloading from: $DOWNLOAD_URL"
  curl -L -o "vendor/opencode/${BINARY}.zip" "$DOWNLOAD_URL"
  echo "Extracting..."
  cd vendor/opencode
  unzip -o "${BINARY}.zip"
  rm "${BINARY}.zip"
  chmod +x opencode
  cd ../..

  if [ ! -f "vendor/opencode/opencode" ]; then
    echo "[!] opencode binary not found after extraction!"
    exit 1
  fi
fi
echo

# 3. Build frontend
echo "[3/4] Building frontend..."
bun run build
echo

# 4. Link CLI globally
echo "[4/4] Registering openkot command globally..."
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
