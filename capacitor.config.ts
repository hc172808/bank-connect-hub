import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration for Virtual Bank mobile app.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * REMOTE UPDATE STRATEGY
 * ─────────────────────────────────────────────────────────────────────────────
 * The compiled APK is a thin native shell. When CAP_PROD_URL is set at build
 * time, the app loads the live web build from that URL on every launch. This
 * means: redeploy the web build → users instantly get the update on next open
 * (no Play Store re-submission, no APK re-install).
 *
 *   • Production OTA :  CAP_PROD_URL=https://your-app.replit.app
 *                       (set this when building the release APK)
 *
 *   • Dev hot-reload :  CAP_SERVER_URL=http://192.168.1.5:5000
 *                       (point at your laptop while `npm run dev` is running)
 *
 *   • Offline / fully bundled fallback:
 *                       Don't set either var. The web bundle in `dist/` is
 *                       packaged into the APK and used directly.
 *
 * Build commands (see setup-mobile.sh):
 *   ./setup-mobile.sh android                       # bundled APK
 *   CAP_PROD_URL=https://app.example.com \
 *     ./setup-mobile.sh release android             # OTA-enabled APK
 */

const liveUrl = process.env.CAP_SERVER_URL;   // dev hot-reload
const prodUrl = process.env.CAP_PROD_URL;     // production remote update
const remote  = liveUrl || prodUrl;

const config: CapacitorConfig = {
  appId: "app.virtualbank.mobile",
  appName: "Virtual Bank",
  webDir: "dist",
  bundledWebRuntime: false,

  android: {
    allowMixedContent: !!liveUrl, // allow http only for dev hot-reload
  },
  ios: {
    contentInset: "always",
  },

  server: remote
    ? {
        url: remote,
        cleartext: remote.startsWith("http://"),
        // Allow the app to navigate to your domain and any sub-paths.
        allowNavigation: ["*.replit.app", "*.replit.dev", "localhost"],
      }
    : {
        androidScheme: "https",
        // Even when fully bundled, allow navigation to the prod domain in case
        // some links resolve outside the bundle.
        allowNavigation: ["*.replit.app"],
      },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      backgroundColor: "#0B1B3F",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
  },
};

export default config;
