#!/usr/bin/env bash
#
# setup-mobile.sh
# One-command Capacitor mobile setup so you can open the app in Android Studio (or Xcode).
#
# Usage:
#   ./setup-mobile.sh android        # add + sync Android, then open Android Studio
#   ./setup-mobile.sh ios            # add + sync iOS, then open Xcode (macOS only)
#   ./setup-mobile.sh both           # add + sync both
#   ./setup-mobile.sh sync           # rebuild web + sync into existing native projects
#   ./setup-mobile.sh dev android    # live-reload mode pointing at your dev server
#
# Requirements:
#   * Node 18+ and npm (already installed by the project)
#   * For Android: Java 17 + Android Studio (https://developer.android.com/studio)
#   * For iOS:     macOS + Xcode + CocoaPods
#
set -euo pipefail
cd "$(dirname "$0")"

GRN='\033[0;32m'; YLW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GRN}[mobile]${NC} $*"; }
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

case "$CMD" in
  android)
    build_web
    ensure_android
    sync_all
    log "Opening Android Studio..."
    npx cap open android || warn "Couldn't open Android Studio automatically. Open the ./android folder in Android Studio manually."
    ;;
  ios)
    if [[ "$(uname)" != "Darwin" ]]; then
      err "iOS builds require macOS with Xcode."; exit 1
    fi
    build_web
    ensure_ios
    sync_all
    log "Opening Xcode..."
    npx cap open ios
    ;;
  both)
    build_web
    ensure_android
    [[ "$(uname)" == "Darwin" ]] && ensure_ios || warn "Skipping iOS (not on macOS)."
    sync_all
    log "Done. Open ./android in Android Studio, ./ios/App/App.xcworkspace in Xcode."
    ;;
  sync)
    build_web
    sync_all
    ;;
  dev)
    if [[ -z "$TARGET" ]]; then err "Usage: $0 dev android|ios"; exit 1; fi
    HOST_IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
    [[ -z "$HOST_IP" ]] && HOST_IP="$(ipconfig getifaddr en0 2>/dev/null || echo localhost)"
    URL="http://${HOST_IP}:5000"
    log "Starting Vite on 0.0.0.0:5000 (already configured) and pointing the app at $URL"
    log "Make sure 'npm run dev' is running in another terminal."
    CAP_SERVER_URL="$URL" npx cap sync "$TARGET"
    npx cap open "$TARGET"
    ;;
  help|*)
    sed -n '2,18p' "$0"
    ;;
esac
