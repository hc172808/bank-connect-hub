import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";
import { ThemeProvider } from "./components/ThemeProvider";
import { LanguageProvider } from "./contexts/LanguageContext";

createRoot(document.getElementById("root")!).render(
  <LanguageProvider>
    <ThemeProvider>
      <App />
    </ThemeProvider>
  </LanguageProvider>
);

// Hide the pre-React HTML splash as soon as we've handed control to React.
// (index.html also watches #root for mutations as a fallback.)
queueMicrotask(() => {
  const w = window as unknown as { __hideAppSplash?: () => void };
  w.__hideAppSplash?.();
});

// Register the service worker (auto-updates in the background).
if (import.meta.env.PROD) {
  registerSW({ immediate: true });
}
