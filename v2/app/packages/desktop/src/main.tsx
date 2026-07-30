// 데스크톱 셸 진입점. 여정 배선은 ui-shared의 VockApp이 가진다.
// web/src/main.tsx와 다른 점 하나: 키링에서 토큰을 **렌더 전에** 1회 로드한다(C4-S2 §1-3).
// 이 순서가 아니면 "로그인 풀린 화면"이 먼저 그려졌다가 뒤늦게 바뀐다.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { VockApp } from "@vock/ui-shared";
import { tauriTokenStore } from "@vock/tauri";
import { useShellDeps } from "./deps.js";
import "@vock/ui-shared/styles.css";

// 최상위 await(vite ES2022). 키링 읽기 실패는 팩토리 안에서 로그아웃 상태로 흡수된다(DS2-7).
const tokens = await tauriTokenStore();

// useShellDeps는 훅이라 컴포넌트가 필요하다.
function Root() {
  const deps = useShellDeps(tokens);
  return <VockApp deps={deps} />;
}

const root = document.getElementById("root");
if (!root) throw new Error("root 엘리먼트를 찾지 못했습니다");

createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
