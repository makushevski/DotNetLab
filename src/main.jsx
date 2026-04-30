import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import { GoogleAnalytics } from "./analytics/GoogleAnalytics.jsx";
import "./styles/styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <GoogleAnalytics />
    <App />
  </StrictMode>
);
