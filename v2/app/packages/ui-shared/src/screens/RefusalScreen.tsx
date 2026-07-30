// 고위험 거부 화면(NFR-306). journey.tsx가 인라인으로 그리던 것을 C4 S4에서 화면 모듈로 옮겼다 —
// 화면은 screens/에 산다는 집 구조를 따르고, 여정 배선이 300행 상한에 반복해서 닿는 것을 멈춘다.

import { useTr } from "../i18n/locale.js";

export interface RefusalScreenProps {
  onHome(): void;
}

export function RefusalScreen({ onHome }: RefusalScreenProps) {
  const tr = useTr();
  return (
    <main className="scroll pad screenIn">
      <h2>{tr("refusal_title")}</h2>
      <button className="btn btn-ghost" style={{ marginTop: "1rem" }} onClick={onHome}>
        {tr("refusal_home")}
      </button>
    </main>
  );
}
