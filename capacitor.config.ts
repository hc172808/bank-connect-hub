import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Capacitor configuration.
 *
 * `webDir` points to the Vite production build output.
 * Run `npm run build` first, then `npx cap sync` to copy the build into the native projects.
 *
 * To use a live dev server on a device (hot reload), set CAP_SERVER_URL before running cap sync,
 * e.g. CAP_SERVER_URL=http://192.168.1.5:5000 npx cap sync
 */
const liveUrl = process.env.CAP_SERVER_URL;

const config: CapacitorConfig = {
  appId: "app.virtualbank.mobile",
  appName: "Virtual Bank",
  webDir: "dist",
  bundledWebRuntime: false,
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: "always",
  },
  server: liveUrl
    ? { url: liveUrl, cleartext: liveUrl.startsWith("http://") }
    : { androidScheme: "https" },
};

export default config;
