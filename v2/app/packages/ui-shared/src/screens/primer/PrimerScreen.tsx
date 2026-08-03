// 세션 종착 화면(d-4). 완성된 프롬프트가 손에 쥐어진 상태로 세션이 끝난다.
//
// 편집은 블록 추가·제거뿐이다(T-3). 자유 입력칸을 두지 않는다 — 마지막 단계에서 자유 입력이
// 주 경로가 되면 표현 비용을 되돌려주는 셈이고, 그것이 §2.1이 금지하는 목적 배신이다.

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useOutputLocale, useTr } from "../../i18n/locale.js";
import { primerBody, type PrimerState } from "../kept/primer.js";
import { SourcePanel } from "./SourcePanel.js";
import { EditSheet } from "./EditSheet.js";
import { selectedTerms, type Selection, type SourceTerm } from "./selection.js";

export interface PrimerScreenProps {
  session: SourceTerm[]; // 스코프 1
  assets: SourceTerm[]; // 스코프 2
  selection: Selection;
  onToggle(termName: string): void;
  topic: string;
  condition?: string;
  primerState?: PrimerState;
  onRefine?(): void;
  onBackToKept(): void;
  onHome(): void;
  mapPanel?: ReactNode | null; // 스코프 3(T-4). null이면 절이 뜨지 않는다
}

export function PrimerScreen(props: PrimerScreenProps) {
  const tr = useTr();
  const { locale } = useOutputLocale();
  const [copied, setCopied] = useState<"idle" | "ok" | "fail">("idle");
  // 복사 버튼의 가시성이 좁은 화면 FAB의 표시 조건이다(T-5).
  const ctaRef = useRef<HTMLDivElement>(null);

  const all = useMemo(() => [...props.session, ...props.assets], [props.session, props.assets]);
  // 화면이 그리는 목록과 클립보드 문자열이 **같은 집합**에서 나온다(T-2).
  const chosen = useMemo(() => selectedTerms(all, props.selection), [all, props.selection]);
  const text = primerBody(props.primerState, {
    topic: props.topic,
    kept: chosen,
    locale,
    ...(props.condition ? { condition: props.condition } : {}),
  });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("ok");
    } catch {
      setCopied("fail");
    }
  };

  const panel = (
    <SourcePanel
      session={props.session}
      assets={props.assets}
      selection={props.selection}
      onToggle={props.onToggle}
      mapPanel={props.mapPanel ?? null}
    />
  );

  return (
    <main className="scroll pad screenIn primerLayout">
      <div className="primerMain">
        <button className="link" onClick={props.onBackToKept}>{tr("kept_back_terms")}</button>
        <h2 style={{ marginTop: "0.75rem" }}>{tr("primer_title")}</h2>

        <div className="divider"><span>{tr("primer_included")}</span></div>
        {chosen.length === 0 ? (
          <p className="listnote">{tr("primer_none")}</p>
        ) : (
          chosen.map((t) => (
            <div className="incRow" key={t.term}>
              <span className="incTerm">{t.term}</span>
              <span className="incLine">{t.one_line}</span>
              <button className="incDrop" onClick={() => props.onToggle(t.term)} aria-label={t.term}>×</button>
            </div>
          ))
        )}

        {/* 붙여넣을 글 그대로. 화면이 보여준 것과 복사되는 것이 같다는 것을 눈으로 확인할 수 있어야 한다. */}
        <pre className="nosrc primerText">{text}</pre>

        <div ref={ctaRef} className="primerCta">
          <button className="btn btn-primary" onClick={copy} disabled={chosen.length === 0}>
            {copied === "ok" ? tr("copy_done") : tr("copy")}
          </button>
          {copied === "fail" ? <p className="errmsg">{tr("copy_fail")}</p> : null}
          {/* 종료 신호. 무엇을 더 붙일지는 S3·S4가 정한다(T-12). */}
          {copied === "ok" ? <p className="listnote">{tr("primer_saved")}</p> : null}
        </div>

        {props.onRefine ? (
          <button className="refinebtn" onClick={props.onRefine} disabled={props.primerState?.phase === "loading"}>
            {props.primerState?.phase === "loading" ? tr("refine_loading") : tr("ai_extra")}
          </button>
        ) : null}
        {props.primerState?.phase === "locked" ? <p className="listnote">{tr(props.primerState.key)}</p> : null}
        {props.primerState?.phase === "failed" ? <p className="errmsg">{tr(props.primerState.key)}</p> : null}

        <button className="link" style={{ marginTop: "1.125rem" }} onClick={props.onHome}>{tr("kept_back_home")}</button>
      </div>

      {/* 넓은 화면: 우측 열. 좁은 화면: 같은 컴포넌트가 시트 안으로(T-6). CSS가 어느 쪽을 보일지 정한다. */}
      <aside className="primerAside">{panel}</aside>
      <EditSheet watchRef={ctaRef}>{panel}</EditSheet>
    </main>
  );
}
