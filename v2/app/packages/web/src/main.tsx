// 웹 SPA 진입점. 마운트만 한다. 여정 배선은 App.tsx가 가진다.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import "@vock/ui-shared/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("root 엘리먼트를 찾지 못했습니다");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
