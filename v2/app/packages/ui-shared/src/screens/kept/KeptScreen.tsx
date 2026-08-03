// 담은 어휘 화면. 목록 관리만 한다.
//
// 붙여넣을 본문은 여기 없다 — 종착 화면(screens/primer)으로 옮겼다(C5-S2 T-1).
// 두 화면이 같은 본문을 보이면 어느 쪽이 진짜인지 흐려지고, v1·v2 모두 이 화면 안에 묻혀 있어서
// 사용자가 "이제 뭘 하지"에서 멈추던 자리다(승계원장 12d-7).

import type { Term } from "@vock/shared";
import { useTr } from "../../i18n/locale.js";

export interface KeptScreenProps {
  kept: Term[];
  onToPrimer(): void;
  onBackToTerms(): void;
  onHome(): void;
  onRemove(term: Term): void;
}

export function KeptScreen({ kept, onToPrimer, onBackToTerms, onHome, onRemove }: KeptScreenProps) {
  const tr = useTr();

  return (
    <main className="scroll pad screenIn">
      <button className="link" onClick={onBackToTerms}>{tr("kept_back_terms")}</button>
      <h2 style={{ marginTop: "0.75rem" }}>{tr("kept_title")}</h2>
      <p className="lead">{kept.length > 0 ? tr("kept_some", { n: kept.length }) : tr("kept_none")}</p>

      {kept.map((t) => (
        <article key={t.term} className="card">
          <div className="crow">
            <div className="cbody">
              <div className="ctitle">
                <span className="term">{t.term}</span>
                {t.kind ? <span className="gchip">{t.kind}</span> : null}
              </div>
              <p className="oneline">{t.one_line}</p>
            </div>
          </div>
          <button className="readbtn close" onClick={() => onRemove(t)}>{tr("keep_on")}</button>
        </article>
      ))}

      {/* 종착으로 가는 주 버튼(T-10). 담기 수로 자동 전환하지 않는다 —
          계속 담고 싶은 사용자를 끊는 것이 오히려 마찰이다. */}
      {kept.length > 0 ? (
        <button className="btn btn-primary" style={{ marginTop: "1.125rem" }} onClick={onToPrimer}>
          {tr("kept_to_primer")}
        </button>
      ) : null}

      <button className="link" style={{ marginTop: "1.125rem" }} onClick={onHome}>{tr("kept_back_home")}</button>
    </main>
  );
}
