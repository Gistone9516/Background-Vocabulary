// 웹 SPA 진입점. S1은 셸과 진입 화면만 띄워 디자인 계승과 반응형을 눈으로 확인하는 단계다.
// 라우팅, 인증 콜백, 광고 슬롯은 뒤 슬라이스에서 붙인다.

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AppShell, EntryScreen } from "@vock/ui-shared";
import "@vock/ui-shared/styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("root 엘리먼트를 찾지 못했습니다");

createRoot(root).render(
  <StrictMode>
    <AppShell>
      <EntryScreen
        onSubmit={(input, condition) => {
          // S2에서 classify 호출로 교체한다.
          console.log("entry submit", { input, condition });
        }}
      />
    </AppShell>
  </StrictMode>,
);
