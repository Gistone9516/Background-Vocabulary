// 담은 어휘 화면. 담은 목록과 메인 AI에 붙여넣을 기본 정리를 보여 준다.
// "AI로 더 정리"는 서버 계약 정합이 끝나는 S4b에서 붙는다.

import { useState } from "react";
import type { Term } from "@vock/shared";
import { tr } from "../../i18n/strings.js";
import { buildBasicPrimer } from "./primer.js";

export interface KeptScreenProps {
  kept: Term[];
  topic: string;
  condition?: string;
  onBackToTerms(): void;
  onHome(): void;
  onRemove(term: Term): void;
}

export function KeptScreen({ kept, topic, condition, onBackToTerms, onHome, onRemove }: KeptScreenProps) {
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  const primer = buildBasicPrimer({ topic, kept, ...(condition ? { condition } : {}) });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(primer);
      setCopied("ok");
    } catch {
      // 클립보드가 막힌 환경이 있다. 그때는 직접 고르라고 안내한다.
      setCopied("fail");
    }
  };

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

      {kept.length > 0 ? (
        <>
          <div className="divider" style={{ marginTop: "1.125rem" }}>
            <span>{tr("paste_head")}</span>
          </div>
          <p className="subhint" style={{ textAlign: "left" }}>{tr("paste_sub")}</p>
          <pre className="nosrc" style={{ whiteSpace: "pre-wrap", marginTop: "0.625rem" }}>{primer}</pre>
          <button className="btn btn-primary" style={{ marginTop: "0.625rem" }} onClick={copy}>
            {copied === "ok" ? tr("copy_done") : tr("copy")}
          </button>
          {copied === "fail" ? <p className="errmsg">{tr("copy_fail")}</p> : null}
        </>
      ) : null}

      <button className="link" style={{ marginTop: "1.125rem" }} onClick={onHome}>{tr("kept_back_home")}</button>
    </main>
  );
}
