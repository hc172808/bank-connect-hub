#!/usr/bin/env bash
# =============================================================================
#  NETLIFE CASH — Android SDK Standalone Installer
#
#  Run this AFTER deploy.sh if you skipped Android SDK installation,
#  or on any server where you want to enable the APK builder feature.
#
#  Usage:
#    sudo bash setup-android.sh
#
#  What this installs:
#    ✓ OpenJDK 21 (if not already installed)
#    ✓ Gradle wrapper / latest installed Gradle (if needed)
#    ✓ Android SDK command-line tools
#    ✓ Android platform SDK 35 + build-tools 34.0.0 + platform-tools
#    ✓ Writes JAVA_HOME + ANDROID_HOME to /etc/environment
#    ✓ Restarts netlifecash-server service so it picks up the new env
# =============================================================================
set -euo pipefail

RED='\033[0;31m'; GRN='\033[0;32m'; YLW='\033[1;33m'
BLU='\033[0;34m'; CYN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${GRN}[android-sdk]${NC} $*"; }
info() { echo -e "${BLU}[info        ]${NC} $*"; }
warn() { echo -e "${YLW}[warn        ]${NC} $*"; }
err()  { echo -e "${RED}[error       ]${NC} $*" >&2; exit 1; }
ok()   { echo -e "${GRN}[  ✓         ]${NC} $*"; }

[[ $EUID -eq 0 ]] || err "Run as root:  sudo bash setup-android.sh"

ANDROID_HOME_PATH="/opt/android-sdk"
GRADLE_VERSION="8.11.1"
CMDLINE_TOOLS_VERSION="11076708"

echo ""
echo -e "${BLU}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLU}║       NETLIFE CASH — Android SDK Installer                ║${NC}"
echo -e "${BLU}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""

# ── Detect package manager ────────────────────────────────────────────────
if   command -v apt-get &>/dev/null; then PKG="apt"
elif command -v dnf     &>/dev/null; then PKG="dnf"
elif command -v yum     &>/dev/null; then PKG="yum"
else err "Unsupported OS"; fi

# ── System dependencies ───────────────────────────────────────────────────
log "Installing system dependencies…"
case "$PKG" in
  apt)
    export DEBIAN_FRONTEND=noninteractive
    apt-get update -qq
    apt-get install -y -qq curl wget unzip zip ca-certificates
    ;;
  dnf|yum)
    $PKG install -y -q curl wget unzip zip ca-certificates
    ;;
esac
ok "System dependencies ready"

# ── Java 21 ───────────────────────────────────────────────────────────────
log "Checking Java…"
JAVA_OK=false
if command -v java &>/dev/null; then
  JAVA_VER=$(java -version 2>&1 | grep -oP '(?<=version ")[0-9]+' | head -1)
  if [[ "${JAVA_VER:-0}" -ge 21 ]]; then
    ok "Java ${JAVA_VER} already installed"
    JAVA_OK=true
  fi
fi
if ! $JAVA_OK; then
  log "Installing OpenJDK 21…"
  case "$PKG" in
    apt) apt-get install -y -qq openjdk-21-jdk ;;
    dnf|yum) $PKG install -y -q java-21-openjdk java-21-openjdk-devel ;;
  esac
  ok "OpenJDK 21 installed"
fi
JAVA_HOME_PATH=$(dirname "$(dirname "$(readlink -f "$(which java)")")")
export JAVA_HOME="$JAVA_HOME_PATH"
ok "JAVA_HOME = $JAVA_HOME"

# ── Gradle 8.11.1 ─────────────────────────────────────────────────────────
if ! command -v gradle &>/dev/null; then
  log "Installing Gradle ${GRADLE_VERSION}…"
  GRADLE_ZIP="/tmp/gradle-${GRADLE_VERSION}-bin.zip"
  curl -fsSL "https://services.gradle.org/distributions/gradle-${GRADLE_VERSION}-bin.zip" \
    -o "$GRADLE_ZIP"
  unzip -q "$GRADLE_ZIP" -d /opt/
  ln -sf "/opt/gradle-${GRADLE_VERSION}/bin/gradle" /usr/local/bin/gradle
  rm -f "$GRADLE_ZIP"
  ok "Gradle $(gradle --version | grep Gradle | awk '{print $2}') installed"
else
  ok "Gradle $(gradle --version | grep Gradle | awk '{print $2}') already installed"
fi

# ── Android SDK command-line tools ────────────────────────────────────────
if [[ -d "${ANDROID_HOME_PATH}/cmdline-tools/latest" ]]; then
  ok "Android SDK already present at ${ANDROID_HOME_PATH}"
else
  log "Downloading Android command-line tools (build ${CMDLINE_TOOLS_VERSION})…"
  ZIP="commandlinetools-linux-${CMDLINE_TOOLS_VERSION}_latest.zip"
  TMP="/tmp/android-cmdtools"
  mkdir -p "${ANDROID_HOME_PATH}/cmdline-tools"
  curl -fsSL "https://dl.google.com/android/repository/${ZIP}" -o "/tmp/${ZIP}"
  unzip -q "/tmp/${ZIP}" -d "$TMP"
  mv "${TMP}/cmdline-tools" "${ANDROID_HOME_PATH}/cmdline-tools/latest"
  rm -rf "/tmp/${ZIP}" "$TMP"
  ok "Android command-line tools installed"
fi

SDKMANAGER="${ANDROID_HOME_PATH}/cmdline-tools/latest/bin/sdkmanager"
export ANDROID_HOME="$ANDROID_HOME_PATH"

# ── Accept licenses ───────────────────────────────────────────────────────
log "Accepting Android SDK licenses…"
yes | "$SDKMANAGER" --sdk_root="${ANDROID_HOME_PATH}" --licenses &>/dev/null || true
ok "Licenses accepted"

# ── Install SDK components ────────────────────────────────────────────────
log "Installing SDK components — this may take a few minutes…"
"$SDKMANAGER" --sdk_root="${ANDROID_HOME_PATH}" \
  "platforms;android-35" \
  "build-tools;34.0.0" \
  "platform-tools" \
  "extras;android;m2repository" \
  "extras;google;m2repository" 2>&1 | grep -v "^\[=" || true
"$SDKMANAGER" --sdk_root="${ANDROID_HOME_PATH}" --update >/dev/null || true
ok "SDK components installed (platform-35, build-tools 34.0.0, platform-tools)"

# ── Environment variables ─────────────────────────────────────────────────
log "Writing environment variables…"
sed -i '/^JAVA_HOME=/d;/^ANDROID_HOME=/d' /etc/environment 2>/dev/null || true
{
  echo "JAVA_HOME=${JAVA_HOME_PATH}"
  echo "ANDROID_HOME=${ANDROID_HOME_PATH}"
} >> /etc/environment

cat > /etc/profile.d/netlifecash-sdk.sh << PROFILE
export JAVA_HOME="${JAVA_HOME_PATH}"
export ANDROID_HOME="${ANDROID_HOME_PATH}"
export PATH="\$PATH:\$JAVA_HOME/bin:\$ANDROID_HOME/platform-tools:\$ANDROID_HOME/cmdline-tools/latest/bin"
PROFILE
chmod +x /etc/profile.d/netlifecash-sdk.sh
ok "JAVA_HOME and ANDROID_HOME set in /etc/environment"

# ── Update app .env if deployed ───────────────────────────────────────────
APP_ENV="/opt/netlifecash/.env"
if [[ -f "$APP_ENV" ]]; then
  sed -i '/^JAVA_HOME=/d;/^ANDROID_HOME=/d' "$APP_ENV"
  echo "JAVA_HOME=${JAVA_HOME_PATH}" >> "$APP_ENV"
  echo "ANDROID_HOME=${ANDROID_HOME_PATH}" >> "$APP_ENV"
  ok "Updated ${APP_ENV}"
fi

# ── Restart build server ──────────────────────────────────────────────────
if systemctl is-active --quiet netlifecash-server 2>/dev/null; then
  log "Restarting netlifecash-server…"
  systemctl restart netlifecash-server
  sleep 2
  systemctl is-active --quiet netlifecash-server \
    && ok "Build server restarted — APK builder is now active" \
    || warn "Build server failed to start. Check: journalctl -u netlifecash-server -n 30"
fi

# ── Verify ────────────────────────────────────────────────────────────────
echo ""
log "Verification:"
info "  java         : $(java -version 2>&1 | head -1)"
info "  gradle       : $(gradle --version 2>/dev/null | grep Gradle || echo 'not found')"
info "  sdkmanager   : $("$SDKMANAGER" --version 2>/dev/null || echo 'error')"
info "  ANDROID_HOME : ${ANDROID_HOME_PATH}"
info "  platform-35  : $([[ -d "${ANDROID_HOME_PATH}/platforms/android-35" ]] && echo 'installed ✓' || echo 'MISSING ✗')"
info "  build-tools  : $([[ -d "${ANDROID_HOME_PATH}/build-tools/34.0.0" ]] && echo '34.0.0 installed ✓' || echo 'MISSING ✗')"

echo ""
echo -e "${GRN}╔═══════════════════════════════════════════════════════════╗${NC}"
echo -e "${GRN}║      Android SDK Setup Complete  🤖                       ║${NC}"
echo -e "${GRN}╠═══════════════════════════════════════════════════════════╣${NC}"
echo -e "${GRN}║  APK builder is fully configured.                         ║${NC}"
echo -e "${GRN}║  Admin → APK Builder → Build APK → Publish                ║${NC}"
echo -e "${GRN}║  Published APKs appear instantly on the Download page.    ║${NC}"
echo -e "${GRN}╚═══════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  Test:        ${CYN}java -version && gradle --version${NC}"
echo -e "  Server logs: ${CYN}journalctl -u netlifecash-server -f${NC}"
echo ""
