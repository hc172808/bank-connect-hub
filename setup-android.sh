#!/usr/bin/env bash
# =============================================================================
#  Virtual Bank — Android SDK Quick Install
#  Installs: OpenJDK 17 + Android command-line tools + required SDK packages
#
#  Usage (Ubuntu/Debian):
#    sudo bash setup-android.sh
#
#  After install, restart the build server:
#    sudo systemctl restart virtualbank-build
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'
BLU='\033[0;34m'; NC='\033[0m'
log()  { echo -e "${GRN}[android]${NC} $*"; }
warn() { echo -e "${YLW}[warn  ]${NC} $*"; }
err()  { echo -e "${RED}[error ]${NC} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || err "Run as root: sudo bash setup-android.sh"

ANDROID_HOME="${ANDROID_HOME:-/opt/android-sdk}"
CMDTOOLS_VERSION="11076708"
CMDTOOLS_URL="https://dl.google.com/android/repository/commandlinetools-linux-${CMDTOOLS_VERSION}_latest.zip"

echo ""
echo -e "${BLU}╔═══════════════════════════════════════════╗${NC}"
echo -e "${BLU}║   Android SDK Installer                   ║${NC}"
echo -e "${BLU}╚═══════════════════════════════════════════╝${NC}"
echo ""
log "Android SDK root: ${ANDROID_HOME}"

# ── Prerequisites ──────────────────────────────────────────────────────────────
log "Installing prerequisites…"
apt-get update -qq
apt-get install -y -qq wget unzip curl ca-certificates

# ── OpenJDK 17 ─────────────────────────────────────────────────────────────────
if java -version 2>&1 | grep -q "17\."; then
  log "Java 17 already installed — skipping"
else
  log "Installing OpenJDK 17…"
  apt-get install -y -qq openjdk-17-jdk-headless
fi

JAVA_HOME=$(readlink -f "$(command -v java)" 2>/dev/null | sed 's|/bin/java||')
log "JAVA_HOME = ${JAVA_HOME}"

# ── Android SDK command-line tools ────────────────────────────────────────────
if [[ -d "${ANDROID_HOME}/cmdline-tools/latest" ]]; then
  log "Android command-line tools already present — skipping download"
else
  log "Downloading Android command-line tools (${CMDTOOLS_VERSION})…"
  mkdir -p "${ANDROID_HOME}/cmdline-tools"
  TMP=$(mktemp -d)
  wget -q --show-progress "${CMDTOOLS_URL}" -O "${TMP}/cmdtools.zip"
  unzip -q "${TMP}/cmdtools.zip" -d "${ANDROID_HOME}/cmdline-tools"
  mv "${ANDROID_HOME}/cmdline-tools/cmdline-tools" "${ANDROID_HOME}/cmdline-tools/latest"
  rm -rf "${TMP}"
  log "Command-line tools installed"
fi

export PATH="$PATH:${ANDROID_HOME}/cmdline-tools/latest/bin:${ANDROID_HOME}/platform-tools"

# ── SDK packages ──────────────────────────────────────────────────────────────
log "Accepting Android licenses…"
yes | sdkmanager --licenses --sdk_root="${ANDROID_HOME}" > /dev/null 2>&1

log "Installing SDK packages (platform-tools, android-34, build-tools 34.0.0)…"
sdkmanager \
  "platform-tools" \
  "platforms;android-34" \
  "build-tools;34.0.0" \
  --sdk_root="${ANDROID_HOME}"

log "Verifying installation…"
sdkmanager --list --sdk_root="${ANDROID_HOME}" 2>/dev/null | grep -E "Installed|platform-tools|android-34|build-tools" | head -10

# ── Environment variables ─────────────────────────────────────────────────────
PROFILE_FILE="/etc/profile.d/android-sdk.sh"
cat > "${PROFILE_FILE}" << ENV
# Android SDK — set by setup-android.sh
export ANDROID_HOME="${ANDROID_HOME}"
export JAVA_HOME="${JAVA_HOME}"
export PATH="\$PATH:\${ANDROID_HOME}/cmdline-tools/latest/bin:\${ANDROID_HOME}/platform-tools:\${ANDROID_HOME}/build-tools/34.0.0"
ENV
log "Environment variables written to ${PROFILE_FILE}"

# ── Symlink for /etc/hosts (so nginx resolves 'build-server') ─────────────────
if ! grep -q "build-server" /etc/hosts 2>/dev/null; then
  echo "127.0.0.1 build-server" >> /etc/hosts
  log "Added '127.0.0.1 build-server' to /etc/hosts"
fi

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GRN}╔═══════════════════════════════════════════╗${NC}"
echo -e "${GRN}║   Android SDK Installed Successfully      ║${NC}"
echo -e "${GRN}╚═══════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ANDROID_HOME = ${BLU}${ANDROID_HOME}${NC}"
echo -e "  JAVA_HOME    = ${BLU}${JAVA_HOME}${NC}"
echo ""
echo -e "  Reload env:     ${YLW}source ${PROFILE_FILE}${NC}"
echo -e "  Build an APK:   ${YLW}bash build-apk.sh --version 1.0.0 --type debug${NC}"
echo ""
echo -e "  If build server is installed as systemd:"
echo -e "    ${YLW}sudo systemctl restart virtualbank-build${NC}"
echo ""
