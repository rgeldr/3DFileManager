import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { readStoredTheme, ThemeProvider } from "./theme/ThemeProvider";
import "./theme/tokens.css";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ThemeProvider initial={readStoredTheme()}>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
