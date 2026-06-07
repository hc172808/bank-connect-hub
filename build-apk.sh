#!/usr/bin/env bash
set -euo pipefail

export ANDROID_HOME=/home/runner/android-sdk
export JAVA_HOME=/nix/store/xad649j61kwkh0id5wvyiab5rliprp4d-openjdk-17.0.15+6/lib/openjdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools

echo "=== Building web bundle ==="
npm run build

echo "=== Syncing into Android ==="
npx cap sync android

echo "=== Building debug APK ==="
cd android
gradle assembleDebug --no-daemon

APK="app/build/outputs/apk/debug/app-debug.apk"
if [[ -f "$APK" ]]; then
  cp "../$APK" ../VirtualBank-debug.apk 2>/dev/null || cp "$APK" ../VirtualBank-debug.apk
  echo ""
  echo "✅ APK ready: VirtualBank-debug.apk"
  ls -lh ../VirtualBank-debug.apk
else
  echo "❌ APK not found at $APK"
  exit 1
fi
