#!/usr/bin/env bash
set -euo pipefail

export ANDROID_HOME=/home/runner/android-sdk
export JAVA_HOME=/nix/store/xad649j61kwkh0id5wvyiab5rliprp4d-openjdk-17.0.15+6/lib/openjdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

VERSION="1.0.0"
BUILD_TYPE="debug"
INCLUDE_RPC=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --type)    BUILD_TYPE="$2"; shift 2 ;;
    --include-rpc) INCLUDE_RPC=true; shift ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

echo "========================================"
echo "  Virtual Bank APK Builder"
echo "  Version   : $VERSION"
echo "  Type      : $BUILD_TYPE"
echo "  RPC Node  : $INCLUDE_RPC"
echo "========================================"
echo ""

# ── 1. RPC Node ───────────────────────────────────────────────────────────────
if [[ "$INCLUDE_RPC" == "true" ]]; then
  echo "=== Setting up RPC Node ==="
  RPC_DIR="public/rpcnode"

  if [[ -d "$RPC_DIR/.git" ]]; then
    echo "Updating existing rpcnode clone..."
    git -C "$RPC_DIR" pull --ff-only 2>&1 || echo "Pull skipped (no remote changes or conflicts)"
  else
    echo "Cloning rpcnode from GitHub..."
    rm -rf "$RPC_DIR"
    git clone --depth 1 https://github.com/hc172808/rpcnode.git "$RPC_DIR" 2>&1
  fi

  if [[ -f "$RPC_DIR/package.json" ]]; then
    echo "Installing RPC node dependencies..."
    (cd "$RPC_DIR" && npm install --production 2>&1)
    echo "RPC node dependencies installed."
  else
    echo "RPC node has no package.json — skipping npm install."
  fi

  echo "RPC node ready at $RPC_DIR"
  echo ""
fi

# ── 2. Stamp version into source files ───────────────────────────────────────
echo "=== Stamping version $VERSION ==="

# capacitor.config.ts
node -e "
const fs = require('fs');
let cfg = fs.readFileSync('capacitor.config.ts','utf8');
cfg = cfg.replace(/appVersion:\s*'[^']*'/, \"appVersion: '$VERSION'\");
fs.writeFileSync('capacitor.config.ts', cfg);
console.log('  capacitor.config.ts updated');
" 2>/dev/null || true

# src/lib/appVersion.ts — this is what the UpdateBanner compares at runtime
sed -i "s/export const APP_VERSION = \"[^\"]*\"/export const APP_VERSION = \"$VERSION\"/" src/lib/appVersion.ts
echo "  src/lib/appVersion.ts → $VERSION"
echo ""

# ── 3. Web bundle ─────────────────────────────────────────────────────────────
echo "=== Building web bundle ==="
npm run build
echo ""

# ── 4. Sync into Android ──────────────────────────────────────────────────────
echo "=== Syncing into Android ==="
npx cap sync android
echo ""

# ── 5. Gradle build ───────────────────────────────────────────────────────────
echo "=== Building ${BUILD_TYPE} APK with Gradle ==="
cd android

if [[ "$BUILD_TYPE" == "release" ]]; then
  gradle assembleRelease --no-daemon
  APK_REL="app/build/outputs/apk/release/app-release-unsigned.apk"
  [[ -f "$APK_REL" ]] || APK_REL="app/build/outputs/apk/release/app-release.apk"
  APK="$APK_REL"
else
  gradle assembleDebug --no-daemon
  APK="app/build/outputs/apk/debug/app-debug.apk"
fi

OUTPUT_NAME="VirtualBank-${VERSION}-${BUILD_TYPE}.apk"
OUTPUT="../${OUTPUT_NAME}"

if [[ -f "$APK" ]]; then
  cp "$APK" "$OUTPUT"
  echo ""
  echo "========================================"
  echo "  BUILD SUCCESSFUL"
  echo "  APK : $OUTPUT_NAME"
  ls -lh "$OUTPUT"
  echo "========================================"
else
  echo "❌ APK not found at $APK"
  exit 1
fi
