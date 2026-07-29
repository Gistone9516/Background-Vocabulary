// 어휘 카드 목록. 상태를 읽어 그리기만 한다. 상한도 취소도 전부 machine.ts에 있다.

import type { Prompt5In } from "@vock/shared";
import { tr } from "../../i18n/strings.js";
import { TermDetail } from "./TermDetail.js";
import type { DetailState } from "./detail-machine.js";
import type { TermCard, TermsState } from "./types.js";

export interface TermsScreenProps {
  state: TermsState;
  detail: DetailState;
  // 카드 하나의 상세 요청을 만든다. 세션 맥락은 화면이 모르므로 바깥에서 받는다.
  detailInputOf(card: TermCard): Prompt5In;
  onToggleDetail(id: string, input: Prompt5In): void;
  onRetryDetail(input: Prompt5In): void;
  onRetry?(): void;
}

export function TermsScreen({ state, detail, detailInputOf, onToggleDetail, onRetryDetail, onRetry }: TermsScreenProps) {
  const items = "items" in state ? state.items : [];
  const streaming = state.phase === "streaming";
  const openId = "id" in detail ? detail.id : null;

  return (
    <main className="scroll pad screenIn">
      {items.length === 0 && streaming ? <p className="lead">{tr("terms_loading")}</p> : null}

      {items.map((t, i) => {
        const open = openId === t.id;
        const input = detailInputOf(t);
        return (
          <article key={t.id} id={`card-${t.id}`} className={open ? "card open" : "card"}>
            <div className="crow">
              <span className="pri">{i + 1}</span>
              <div className="cbody">
                <div className="ctitle">
                  <span className="term">{t.term}</span>
                  {t.kind ? <span className="gchip">{t.kind}</span> : null}
                </div>
                <p className="oneline">{t.one_line}</p>
                {t.why ? (
                  <p className="why">
                    <b>{tr("terms_why")}</b>
                    <span>{t.why}</span>
                  </p>
                ) : null}
              </div>
            </div>

            <TermDetail state={detail} id={t.id} onRetry={() => onRetryDetail(input)} />

            <button
              className={open ? "readbtn close" : "readbtn"}
              onClick={() => onToggleDetail(t.id, input)}
            >
              {open ? tr("detail_close") : tr("detail_open")}
            </button>
          </article>
        );
      })}

      {streaming && items.length > 0 ? <p className="note">{tr("terms_streaming")}</p> : null}

      {state.phase === "settled" && state.reason === "capped" ? <p className="listnote">{tr("terms_capped")}</p> : null}

      {state.phase === "failed" ? (
        <>
          {/* 실패해도 이미 받은 카드는 남긴다. 부분 결과도 가치가 있다. */}
          <p className="errmsg">
            {state.error.kind === "network" ? tr("err_network") : (state.error as { message?: string }).message ?? tr("err_network")}
          </p>
          {onRetry ? (
            <button className="btn btn-ghost" style={{ marginTop: "0.75rem" }} onClick={onRetry}>
              {tr("retry")}
            </button>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
