import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { GoogleAnalytics } from "./analytics/GoogleAnalytics.jsx";
import LabApp from "./labs/LabApp.jsx";
import "./styles/labs.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <GoogleAnalytics />
    <LabApp />
  </StrictMode>
);
