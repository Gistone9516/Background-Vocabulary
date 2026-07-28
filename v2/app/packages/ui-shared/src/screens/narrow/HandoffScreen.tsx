// S2 확인 화면. 좁히기 결과가 제대로 만들어졌는지 눈으로 보기 위한 최소 화면이고
// S3에서 어휘 목록 화면으로 교체된다. 제품 화면이 아니다.
// 종료 사유 고지 정책(스펙 D-9)이 실제로 적용되는 지점이라 여기서 먼저 검증한다.

import { tr } from "../../i18n/strings.js";
import { realAnswers } from "./decide.js";
import type { DoneReason, NarrowCtx } from "./types.js";

export interface HandoffScreenProps {
  ctx: NarrowCtx;
  reason: DoneReason;
}

// 사용자가 직접 끊은 경우와 내부 오류는 알리지 않는다. 전자는 본인이 한 행동이고
// 후자는 원인을 설명할 수 없어 불안만 준다(스펙 D-9).
function noticeOf(reason: DoneReason): string | null {
  if (reason === "enough") return tr("done_enough");
  if (reason === "exhausted") return tr("done_exhausted");
  return null;
}

export function HandoffScreen({ ctx, reason }: HandoffScreenProps) {
  const notice = noticeOf(reason);
  return (
    <main className="scroll pad screenIn">
      <h2>{tr("handoff_title")}</h2>
      {notice ? <p className="lead" style={{ marginTop: "0.5rem" }}>{notice}</p> : null}

      <p className="label" style={{ marginTop: "1.125rem" }}>{ctx.classifyOut.domain}</p>
      <div className="chips">
        {ctx.answers.map((a, i) =>
          a.kind === "tooHard" ? (
            <span key={i} className="chip">{tr("narrow_hard")}</span>
          ) : (
            a.labels.map((l) => (
              <span key={i + l} className="chip">{l}</span>
            ))
          )
        )}
      </div>

      <p className="note">
        {`답변 ${realAnswers(ctx.answers)}턴 · 세션 ${ctx.sessionId.slice(0, 8)} · 종료 ${reason}`}
      </p>
      <p className="note">{tr("handoff_next")}</p>
    </main>
  );
}
