// 사이드패널 React 앱 진입점. React 18 createRoot.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import "./theme.css";

// 처리되지 않은 비동기 예외(promise 거부)는 ErrorBoundary가 못 잡는다(렌더 단계 예외만 잡음).
// 최소한 콘솔에 남겨, void로 띄운 저장·네트워크 호출 실패가 조용히 사라지지 않게 한다.
window.addEventListener("unhandledrejection", (e) => {
  console.error("처리되지 않은 비동기 오류:", e.reason);
});

const rootEl = document.getElementById("root");
if (!rootEl) throw new Error("root 요소를 찾을 수 없습니다.");

createRoot(rootEl).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
