import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { Gate } from "./LockScreen";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Gate>
      <App />
    </Gate>
  </React.StrictMode>,
);

// Installed app (PWA): cache the app so it opens instantly and works offline. Production only,
// so the dev server's hot reload never fights a cached copy.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((error) => console.error("Service worker failed", error));
  });
}
