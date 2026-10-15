import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { Toaster } from "sonner";

import App from "@/App";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./index.css";

const container = document.getElementById("root");
if (!container) throw new Error("Root element #root is missing from index.html");

ReactDOM.createRoot(container).render(
  <React.StrictMode>
    {/* HashRouter keeps deep links working from the `tauri://` scheme. */}
    <HashRouter>
      <TooltipProvider delayDuration={250}>
        <App />
        <Toaster
          position="bottom-right"
          theme="dark"
          closeButton
          richColors
          toastOptions={{ duration: 4000 }}
        />
      </TooltipProvider>
    </HashRouter>
  </React.StrictMode>,
);
