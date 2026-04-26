#!/usr/bin/env bash
#
# setup-mobile.sh
# One-command Capacitor mobile setup. Builds an APK (or iOS app) you can open in
# Android Studio / Xcode, with optional remote-update (OTA) support so the
# installed app always loads the latest deployed web build.
#
# USAGE
#   ./setup-mobile.sh android                   # Add + sync Android, open Android Studio
#   ./setup-mobile.sh ios                       # macOS + Xcode + CocoaPods required
#   ./setup-mobile.sh both                      # Android + iOS (iOS only on macOS)
#   ./setup-mobile.sh sync                      # Re-build web + sync into native
#   ./setup-mobile.sh dev android               # Live hot-reload from your dev server
#   CAP_PROD_URL=https://your-app.replit.app \
#     ./setup-mobile.sh release android         # OTA-enabled APK (always loads URL)
#   ./setup-mobile.sh apk                       # Build the debug APK from CLI (no IDE)
#
# REMOTE UPDATE (OTA) — recommended workflow
#   1. Deploy your web app once  (e.g. https://virtualbank.replit.app)
#   2. Build the APK ONCE with:
#        CAP_PROD_URL=https://virtualbank.replit.app ./setup-mobile.sh release android
#   3. Distribute that APK. Every future change is shipped by simply redeploying
#      the web build — users see it on next app open. No re-install needed.
#
# REQUIREMENTS
#   * Node 18+ and npm  (already installed by the project)
#   * Android: Java 17 (JDK) + Android Studio  (https://developer.android.com/studio)
#   * iOS:    macOS + Xcode + CocoaPods
#
set -euo pipefail
cd "$(dirname "$0")"

GRN='\033[0;32m'; YLW='\033[1;33m'; RED='\033[0;31m'; BLU='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GRN}[mobile]${NC} $*"; }
info() { echo -e "${BLU}[mobile]${NC} $*"; }
warn() { echo -e "${YLW}[mobile]${NC} $*"; }
err()  { echo -e "${RED}[mobile]${NC} $*" >&2; }

CMD="${1:-help}"
TARGET="${2:-}"

build_web() {
  log "Building web bundle (dist/)..."
  npm run build
}

ensure_android() {
  if [[ ! -d android ]]; then
    log "Adding Android platform..."
    npx cap add android
  fi
}

ensure_ios() {
  if [[ ! -d ios ]]; then
    log "Adding iOS platform..."
    npx cap add ios
  fi
}

sync_all() {
  log "Syncing web assets and Capacitor plugins into native projects..."
  npx cap sync
}

print_remote_status() {
  if [[ -n "${CAP_PROD_URL:-}" ]]; then
    info "OTA mode ON — APK will load from: ${CAP_PROD_URL}"
    info "  → Update the app remotely by redeploying the web build at that URL."
  elif [[ -n "${CAP_SERVER_URL:-}" ]]; then
    info "DEV hot-reload — APK will load from: ${CAP_SERVER_URL}"
  else
    info "Bundled mode — web assets baked into the APK (no OTA)."
    info "  Tip: re-run with CAP_PROD_URL=https://yourapp.example to enable OTA."
  fi
}

case "$CMD" in
  android)
    print_remote_status
    build_web
    ensure_android
    sync_all
    log "Opening Android Studio..."
    npx cap open android || warn "Couldn't open Android Studio. Open the ./android folder manually."
    ;;

  ios)
    if [[ "$(uname)" != "Darwin" ]]; then
      err "iOS builds require macOS with Xcode."; exit 1
    fi
    print_remote_status
    build_web
    ensure_ios
    sync_all
    log "Opening Xcode..."
    npx cap open ios
    ;;

  both)
    print_remote_status
    build_web
    ensure_android
    [[ "$(uname)" == "Darwin" ]] && ensure_ios || warn "Skipping iOS (not on macOS)."
    sync_all
    log "Done. Open ./android in Android Studio, ./ios/App/App.xcworkspace in Xcode."
    ;;

  sync)
    print_remote_status
    build_web
    sync_all
    ;;

  dev)
    if [[ -z "$TARGET" ]]; then err "Usage: $0 dev android|ios"; exit 1; fi
    HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    [[ -z "$HOST_IP" ]] && HOST_IP="$(ipconfig getifaddr en0 2>/dev/null || echo localhost)"
    URL="http://${HOST_IP}:5000"
    log "Live hot-reload mode — pointing app at $URL"
    log "Make sure 'npm run dev' is running on this machine."
    CAP_SERVER_URL="$URL" npx cap sync "$TARGET"
    npx cap open "$TARGET"
    ;;

  release)
    if [[ -z "$TARGET" ]]; then
      err "Usage: CAP_PROD_URL=https://your-app ./setup-mobile.sh release android|ios"
      exit 1
    fi
    if [[ -z "${CAP_PROD_URL:-}" ]]; then
      err "CAP_PROD_URL is required for a release build."
      err "Example:"
      err "  CAP_PROD_URL=https://virtualbank.replit.app ./setup-mobile.sh release $TARGET"
      exit 1
    fi
    info "OTA release mode — APK will fetch the latest UI from ${CAP_PROD_URL} on every launch."
    build_web
    if [[ "$TARGET" == "android" ]]; then ensure_android; fi
    if [[ "$TARGET" == "ios" ]]; then
      [[ "$(uname)" != "Darwin" ]] && { err "iOS requires macOS."; exit 1; }
      ensure_ios
    fi
    npx cap sync "$TARGET"
    log "Opening native IDE — build the signed release artifact from there."
    log "  Android Studio:  Build > Build Bundle(s)/APK(s) > Build APK(s)"
    log "  Xcode        :   Product > Archive"
    npx cap open "$TARGET" || warn "Open the native project manually."
    ;;

  apk)
    # Headless debug-APK build (no IDE). Useful for CI / quick testing.
    print_remote_status
    build_web
    ensure_android
    sync_all
    if [[ ! -x android/gradlew ]]; then
      err "android/gradlew not found. Run: $0 android  first to initialise."
      exit 1
    fi
    log "Building debug APK with Gradle (this can take a few minutes)..."
    ( cd android && ./gradlew assembleDebug )
    APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"
    if [[ -f "$APK_PATH" ]]; then
      log "✓ APK built: $APK_PATH"
      info "Install on a device with:  adb install -r $APK_PATH"
    else
      warn "Build finished but APK not found at $APK_PATH"
    fi
    ;;

  help|*)
    sed -n '2,28p' "$0"
    ;;
esac
