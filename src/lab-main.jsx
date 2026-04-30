import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import LabApp from "./labs/LabApp.jsx";
import "./styles/labs.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <LabApp />
  </StrictMode>
);
