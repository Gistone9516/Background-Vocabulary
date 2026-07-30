// 카드 상세 본문. 개념·내 상황·활용 3단과 출처를 보여 준다.
// 출처가 비어 있으면 없다고 말한다. 지어내지 않는다.

import { useTr } from "../../i18n/locale.js";
import type { DetailState } from "./detail-machine.js";

export interface TermDetailProps {
  state: DetailState;
  id: string;
  onRetry(): void;
}

// 활용은 짧은 행동 단계로 끊어 번호를 매긴다. 문장이 하나뿐이면 그대로 한 줄로 둔다.
function steps(how: string): string[] {
  const parts = how
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return parts.length > 1 ? parts : [how];
}

export function TermDetail({ state, id, onRetry }: TermDetailProps) {
  const tr = useTr();
  if (!("id" in state) || state.id !== id) return null;

  if (state.phase === "loading") {
    return (
      <div className="detail">
        <p className="dtext">{tr("detail_loading")}</p>
      </div>
    );
  }

  if (state.phase === "locked") {
    return (
      <div className="detail">
        <p className="nosrc">{state.message}</p>
      </div>
    );
  }

  if (state.phase === "failed") {
    return (
      <div className="detail">
        <p className="errmsg">{state.error.kind === "network" ? tr("err_network") : (state.error as { message?: string }).message ?? tr("err_network")}</p>
        <button className="readbtn close" style={{ marginTop: "0.5rem" }} onClick={onRetry}>
          {tr("retry")}
        </button>
      </div>
    );
  }

  if (state.phase !== "open") return null;
  const { out } = state;

  return (
    <div className="detail">
      <div className="dparts">
        <div className="dpart">
          <span className="dlabel">{tr("detail_what")}</span>
          <p className="dtext">{out.what}</p>
        </div>

        <div className="dpart mine">
          <span className="dlabel">{tr("detail_whymine")}</span>
          <p className="dtext">{out.whymine}</p>
        </div>

        <div className="dpart">
          <span className="dlabel">{tr("detail_how")}</span>
          <ol className="dsteps">
            {steps(out.how).map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </div>

        {out.misc ? <p className="dmemo">{out.misc}</p> : null}

        <div className="dpart">
          <span className="dlabel">{tr("detail_sources")}</span>
          {out.sources.length > 0 ? (
            out.sources.map((s) => (
              <a key={s.url} className="src" href={s.url} target="_blank" rel="noreferrer noopener">
                <span>
                  <b>{s.title}</b>
                  <small>{s.site}</small>
                </span>
              </a>
            ))
          ) : (
            // 근거 없는 귀속보다 없다고 말하는 것이 낫다.
            <p className="nosrc">{tr("detail_nosrc")}</p>
          )}
        </div>
      </div>
    </div>
  );
}
