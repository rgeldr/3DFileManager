import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { installDebugProbes } from "./debugLog";
import { readStoredTheme, ThemeProvider } from "./theme/ThemeProvider";
import "./styles/tokens.css";
import "./styles/index.css";

installDebugProbes();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AppErrorBoundary>
      <ThemeProvider initial={readStoredTheme()}>
        <App />
      </ThemeProvider>
    </AppErrorBoundary>
  </StrictMode>,
);
