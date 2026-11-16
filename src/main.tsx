import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "bootstrap/dist/css/bootstrap.min.css";
import "font-awesome/css/font-awesome.min.css";
import "./styles/theme-variables.css";
import "./styles/shell.css";
import "./styles/components.css";
import "./styles/overrides.css";
import "./styles/dashboard.css";
import "./styles/demo.css";
import "./styles/fidelity.css";
import { App } from "./App";
import { StoreProvider } from "./store";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
