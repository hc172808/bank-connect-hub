#!/usr/bin/env bash
set -euo pipefail

export ANDROID_HOME=/home/runner/android-sdk
export JAVA_HOME=/nix/store/xad649j61kwkh0id5wvyiab5rliprp4d-openjdk-17.0.15+6/lib/openjdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/34.0.0

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

# ── 0. Debug keystore ─────────────────────────────────────────────────────────
KEYSTORE="android/debug.keystore"
if [[ ! -f "$KEYSTORE" ]]; then
  echo "=== Generating debug keystore ==="
  "$JAVA_HOME/bin/keytool" -genkeypair \
    -keystore "$KEYSTORE" \
    -alias androiddebugkey \
    -keypass android \
    -storepass android \
    -dname "CN=Android Debug,O=Android,C=US" \
    -keyalg RSA \
    -keysize 2048 \
    -validity 10000 \
    -v 2>&1
  echo "Keystore created at $KEYSTORE"
  echo ""
fi

# ── 1. RPC Node ───────────────────────────────────────────────────────────────
if [[ "$INCLUDE_RPC" == "true" ]]; then
  echo "=== Setting up RPC Node ==="
  RPC_DIR="public/rpcnode"

  if [[ -d "$RPC_DIR/.git" ]]; then
    echo "Updating existing rpcnode clone..."
    git -C "$RPC_DIR" pull --ff-only 2>&1 || echo "Pull skipped"
  else
    echo "Cloning rpcnode from GitHub..."
    rm -rf "$RPC_DIR"
    git clone --depth 1 https://github.com/hc172808/rpcnode.git "$RPC_DIR" 2>&1
  fi

  if [[ -f "$RPC_DIR/package.json" ]]; then
    echo "Installing RPC node dependencies..."
    (cd "$RPC_DIR" && npm install --production 2>&1)
  fi
  echo "RPC node ready."
  echo ""
fi

# ── 2. Stamp version ──────────────────────────────────────────────────────────
echo "=== Stamping version $VERSION ==="
node -e "
const fs = require('fs');
let cfg = fs.readFileSync('capacitor.config.ts','utf8');
cfg = cfg.replace(/appVersion:\s*'[^']*'/, \"appVersion: '$VERSION'\");
fs.writeFileSync('capacitor.config.ts', cfg);
console.log('  capacitor.config.ts updated');
" 2>/dev/null || true

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
echo "=== Building ${BUILD_TYPE} APK ==="
cd android

# Pass version as Gradle project property for dynamic versionCode/Name
if [[ "$BUILD_TYPE" == "release" ]]; then
  gradle assembleRelease --no-daemon -PapkVersion="$VERSION"
  RAW_APK="app/build/outputs/apk/release/app-release.apk"
  [[ -f "$RAW_APK" ]] || RAW_APK="app/build/outputs/apk/release/app-release-unsigned.apk"
else
  gradle assembleDebug --no-daemon -PapkVersion="$VERSION"
  RAW_APK="app/build/outputs/apk/debug/app-debug.apk"
fi

if [[ ! -f "$RAW_APK" ]]; then
  echo "❌ Gradle output APK not found at $RAW_APK"
  exit 1
fi

cd ..

# ── 6. Re-sign with apksigner (V1 + V2 + V3) ──────────────────────────────────
echo ""
echo "=== Signing APK (V1+V2+V3) ==="
UNSIGNED_APK="android/$RAW_APK"
OUTPUT_NAME="VirtualBank-${VERSION}-${BUILD_TYPE}.apk"
OUTPUT="${OUTPUT_NAME}"

apksigner sign \
  --ks "$KEYSTORE" \
  --ks-pass pass:android \
  --ks-key-alias androiddebugkey \
  --key-pass pass:android \
  --v1-signing-enabled true \
  --v2-signing-enabled true \
  --v3-signing-enabled true \
  --out "$OUTPUT" \
  "$UNSIGNED_APK"

echo ""
echo "=== Verifying signature ==="
apksigner verify --verbose "$OUTPUT" 2>&1 | grep -E "Verified|v1|v2|v3|error" || true

echo ""
echo "========================================"
echo "  BUILD SUCCESSFUL"
echo "  APK : $OUTPUT_NAME"
ls -lh "$OUTPUT"
echo "========================================"
