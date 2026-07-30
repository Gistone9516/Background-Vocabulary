// 데스크톱 셸 진입점. 마운트만 한다. 여정 배선은 ui-shared의 VockApp이 가진다.
// web/src/main.tsx와 같은 모양인 것이 정상이다 — 셸의 차이는 deps.ts 한 파일에만 있다.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { VockApp } from "@vock/ui-shared";
import { useShellDeps } from "./deps.js";
import "@vock/ui-shared/styles.css";

// useShellDeps는 훅이라 컴포넌트가 필요하다.
function Root() {
  const deps = useShellDeps();
  return <VockApp deps={deps} />;
}

const root = document.getElementById("root");
if (!root) throw new Error("root 엘리먼트를 찾지 못했습니다");

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
