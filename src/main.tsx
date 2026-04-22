import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

createRoot(document.getElementById("root")!).render(<App />);

// Register the service worker (auto-updates in the background).
if (import.meta.env.PROD) {
  registerSW({ immediate: true });
}
