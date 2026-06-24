// 사이드패널 React 앱 진입점.
// React 18 createRoot API를 쓴다.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

// CSS keyframe animation. Vite가 번들할 때 style 태그로 삽입된다.
// spinner와 dot animation을 정의한다.
const styleEl = document.createElement("style");
styleEl.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
  }
`;
document.head.appendChild(styleEl);

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("root 요소를 찾을 수 없습니다.");

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>
);
