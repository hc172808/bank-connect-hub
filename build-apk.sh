#!/usr/bin/env bash
set -euo pipefail

# ── Load .env so VITE_ vars are available for env-config.js injection ────────
# shellcheck disable=SC1091
[[ -f ".env" ]]       && { set +u; source ".env";       set -u; }
[[ -f ".env.local" ]] && { set +u; source ".env.local"; set -u; }

# ── Auto-detect ANDROID_HOME ────────────────────────────────────────────────
# Priority: env var → common install paths
if [[ -z "${ANDROID_HOME:-}" ]]; then
  for _candidate in \
      /opt/android-sdk \
      /home/runner/android-sdk \
      "$HOME/android-sdk" \
      /usr/lib/android-sdk \
      /opt/android; do
    if [[ -d "$_candidate/cmdline-tools" || -d "$_candidate/platform-tools" ]]; then
      export ANDROID_HOME="$_candidate"
      break
    fi
  done
fi

if [[ -z "${ANDROID_HOME:-}" ]]; then
  echo "⚠️  Android SDK not found — auto-installing to /home/runner/android-sdk..."
  ANDROID_HOME=/home/runner/android-sdk
  export ANDROID_HOME
  mkdir -p "$ANDROID_HOME/cmdline-tools"
  _CMDTOOLS_ZIP=/tmp/_cmdtools_$$.zip
  curl -sL "https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip" \
    -o "$_CMDTOOLS_ZIP"
  unzip -q "$_CMDTOOLS_ZIP" -d "$ANDROID_HOME/cmdline-tools"
  mv "$ANDROID_HOME/cmdline-tools/cmdline-tools" "$ANDROID_HOME/cmdline-tools/latest"
  rm -f "$_CMDTOOLS_ZIP"
  export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin"
  yes | sdkmanager --licenses --sdk_root="$ANDROID_HOME" >/dev/null 2>&1 || true
  sdkmanager "platform-tools" "platforms;android-35" "build-tools;34.0.0" \
    --sdk_root="$ANDROID_HOME" 2>&1
  echo "✅ Android SDK installed at $ANDROID_HOME"
fi

# Always keep local.properties in sync with the detected ANDROID_HOME
echo "sdk.dir=$ANDROID_HOME" > android/local.properties

# ── Auto-detect JAVA_HOME ────────────────────────────────────────────────────
if [[ -z "${JAVA_HOME:-}" ]]; then
  for _candidate in \
      /usr/lib/jvm/java-17-openjdk-amd64 \
      /usr/lib/jvm/java-17-openjdk \
      /usr/lib/jvm/temurin-17 \
      /usr/local/lib/jvm/java-17; do
    if [[ -d "$_candidate" ]]; then
      export JAVA_HOME="$_candidate"
      break
    fi
  done
  # Also try to find via update-alternatives / nix store
  if [[ -z "${JAVA_HOME:-}" ]]; then
    _java_bin=$(command -v java 2>/dev/null || true)
    if [[ -n "$_java_bin" ]]; then
      _real=$(readlink -f "$_java_bin")
      export JAVA_HOME="${_real%/bin/java}"
    fi
  fi
fi

if [[ -z "${JAVA_HOME:-}" ]]; then
  echo "❌ Java 17 not found. Install it: apt install openjdk-17-jdk"
  exit 1
fi

export PATH="$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/34.0.0:$JAVA_HOME/bin"

VERSION="1.0.0"
BUILD_TYPE="debug"
INCLUDE_RPC=false
RPC_URL=""
CHAIN_ID=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --version)   VERSION="$2"; shift 2 ;;
    --type)      BUILD_TYPE="$2"; shift 2 ;;
    --include-rpc) INCLUDE_RPC=true; shift ;;
    --rpc-url)   RPC_URL="$2"; shift 2 ;;
    --chain-id)  CHAIN_ID="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

echo "========================================"
echo "  Virtual Bank APK Builder"
echo "  Version   : $VERSION"
echo "  Type      : $BUILD_TYPE"
echo "  RPC Node  : $INCLUDE_RPC"
[[ -n "$RPC_URL"  ]] && echo "  RPC URL   : $RPC_URL"
[[ -n "$CHAIN_ID" ]] && echo "  Chain ID  : $CHAIN_ID"
echo "========================================"

# ── Inject network config into Vite env before building ───────────────────────
if [[ -n "$RPC_URL" || -n "$CHAIN_ID" ]]; then
  echo "=== Writing network config to .env.local ==="
  {
    [[ -n "$RPC_URL"  ]] && echo "VITE_RPC_URL=$RPC_URL"
    [[ -n "$CHAIN_ID" ]] && echo "VITE_CHAIN_ID=$CHAIN_ID"
  } >> .env.local
  echo ".env.local updated"
  echo ""
fi
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

# ── 3b. Inject env-config.js into dist/ for bundled APK mode ─────────────────
#
# WHY THIS IS NEEDED:
#   In Docker/nginx mode, docker/generate-env.sh writes env-config.js at
#   container start so window.__ENV__ is set before the React app boots.
#   But in a bundled APK there is no server — the Capacitor WebView loads
#   files directly from the assets bundle.  Without this file the <script>
#   tag in index.html fails silently, window.__ENV__ stays undefined, and
#   the Supabase client gets empty strings → blank white screen.
#
# FIX: write a static env-config.js into dist/ BEFORE cap sync so the file
#   is packaged into the APK assets and loaded correctly on every device.
echo "=== Injecting env-config.js into dist/ (fixes blank APK) ==="
_SUP_URL="${VITE_SUPABASE_URL:-}"
_SUP_KEY="${VITE_SUPABASE_PUBLISHABLE_KEY:-}"
_SUP_PID="${VITE_SUPABASE_PROJECT_ID:-}"
_WA_NUM="${VITE_WHATSAPP_SUPPORT_NUMBER:-}"

# Warn loudly if the key vars are missing
if [[ -z "$_SUP_URL" || -z "$_SUP_KEY" ]]; then
  echo ""
  echo "  ╔══════════════════════════════════════════════════════════════════╗"
  echo "  ║  ⚠️  WARNING: VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY ║"
  echo "  ║     is empty.  The APK will show a blank screen at launch.      ║"
  echo "  ║                                                                  ║"
  echo "  ║  FIX: add them to your .env file and rebuild.                   ║"
  echo "  ╚══════════════════════════════════════════════════════════════════╝"
  echo ""
fi

mkdir -p dist
cat > dist/env-config.js << ENVJS
// Auto-generated by build-apk.sh on $(date -u +%Y-%m-%dT%H:%M:%SZ)
// Provides window.__ENV__ in the Capacitor WebView (replaces the server-side
// docker/generate-env.sh which only runs in Docker/nginx container mode).
// DO NOT edit this file manually — it is overwritten on every APK build.
window.__ENV__ = {
  VITE_SUPABASE_URL: "${_SUP_URL}",
  VITE_SUPABASE_PUBLISHABLE_KEY: "${_SUP_KEY}",
  VITE_SUPABASE_PROJECT_ID: "${_SUP_PID}",
  VITE_WHATSAPP_SUPPORT_NUMBER: "${_WA_NUM}"
};
ENVJS

if [[ -n "$_SUP_URL" ]]; then
  echo "  ✓ dist/env-config.js written"
  echo "    Supabase URL : ${_SUP_URL:0:50}…"
  echo "    Key (first 20): ${_SUP_KEY:0:20}…"
else
  echo "  ✗ dist/env-config.js written with EMPTY values"
fi
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
