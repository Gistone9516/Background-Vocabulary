// 사이드패널 React 앱 진입점. React 18 createRoot.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "./theme.css";

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("root 요소를 찾을 수 없습니다.");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
