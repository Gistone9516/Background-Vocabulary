// 좁히기 화면. 상태를 읽어 그리고 이벤트만 올려보낸다. 판단은 전부 machine.ts에 있다.
// v1은 이 자리에 전이 규칙과 네트워크 호출이 함께 있었다. 여기에는 둘 다 없다.

import { useRef } from "react";
import { useTr } from "../../i18n/locale.js";
import { errorKey, isRetryable } from "../../api/index.js";
import { answeredCount } from "./machine.js";
import { turnsLeft } from "./decide.js";
import type { NarrowConfig, NarrowEvent, NarrowState } from "./types.js";

export interface NarrowScreenProps {
  state: NarrowState;
  cfg: NarrowConfig;
  send(e: NarrowEvent): void;
}

export function NarrowScreen({ state, cfg, send }: NarrowScreenProps) {
  const tr = useTr();
  const customRef = useRef<HTMLTextAreaElement>(null);

  // relating = 연결 턴 조회 중. 다른 대기 구간과 같은 화면을 쓴다(S-29 아님, S-28).
  if (state.phase === "classifying" || state.phase === "advancing" || state.phase === "relating") {
    return (
      <main className="scroll pad screenIn">
        <p className="lead" style={{ textAlign: "center", marginTop: "3rem" }}>{tr("thinking")}</p>
      </main>
    );
  }

  if (state.phase === "failed") {
    const canRetry = isRetryable(state.error);
    // 문구는 오류 종류에서 나온다(S-35). 서버 message를 캐스트로 꺼내던 것을 걷어냈다.
    const message = tr(errorKey(state.error));
    return (
      <main className="scroll pad screenIn">
        <p className="errmsg" style={{ textAlign: "center", marginTop: "3rem" }}>{message}</p>
        {canRetry ? (
          <button className="btn btn-primary" style={{ marginTop: "1rem" }} onClick={() => send({ t: "retry" })}>
            {tr("retry")}
          </button>
        ) : null}
      </main>
    );
  }

  if (state.phase !== "asking") return null;

  const { ctx, question, picks } = state;
  const answered = answeredCount(ctx);
  const left = turnsLeft(ctx, cfg.narrowMax);
  const canConfirm = picks.tooHard || picks.selected.length > 0 || picks.custom.trim().length > 0;
  // 연결 턴이면 좁히기는 이미 끝났다. 기계가 두 이벤트를 무시하므로 버튼도 내린다(S-29).
  const connecting = state.connect !== undefined;
  const canUndo = !connecting && !ctx.usedUndo && ctx.answers.some((a) => a.kind === "picks");

  return (
    <main className="scroll pad screenIn">
      <p className="rangehint">
        {tr("narrow_ai", { n: answered + 1 })}
        {left > 0 ? ` · ${tr("narrow_budget", { n: left })}` : ""}
      </p>
      {ctx.simplify ? <p className="subhint">{tr("narrow_simplified")}</p> : null}

      <h2 style={{ marginTop: "0.875rem" }}>{question.question}</h2>
      <p className="lead" style={{ margin: "0.375rem 0 1rem" }}>{tr("narrow_lead")}</p>

      {question.choices.map((o) => (
        <button
          key={o.label}
          className={picks.selected.includes(o.label) ? "opt sel" : "opt"}
          onClick={() => send({ t: "toggle", label: o.label })}
        >
          <span>{o.label}</span>
          <span className="tick">✓</span>
        </button>
      ))}

      <textarea
        ref={customRef}
        className="field"
        rows={1}
        aria-label={tr("custom_open")}
        placeholder={tr("custom_ph")}
        value={picks.custom}
        style={{ marginTop: "0.6875rem" }}
        onChange={(e) => send({ t: "custom", text: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            if (canConfirm) send({ t: "confirm" });
          }
        }}
      />
      <p className="subhint">{tr("custom_hint")}</p>

      <div className="subrow">
        {canUndo ? (
          <button className="sublink" title={tr("undo_title")} onClick={() => send({ t: "undo" })}>
            {tr("undo_left", { n: left })}
          </button>
        ) : (
          <span />
        )}
        {/* 쉬운 모드가 켜지면 감춘다. 두 번째 누름은 정보가 없고 서버 비용만 든다(스펙 D-5) */}
        {connecting || ctx.simplify ? null : (
          <button className={picks.tooHard ? "sublink on" : "sublink"} onClick={() => send({ t: "tooHard" })}>
            {tr("narrow_hard")}
          </button>
        )}
      </div>

      <button
        className="btn btn-primary"
        style={{ marginTop: "1rem" }}
        onClick={() => send({ t: "confirm" })}
        disabled={!canConfirm}
      >
        {tr("next")}
      </button>
      <button className="btn btn-ghost" style={{ marginTop: "0.625rem" }} onClick={() => send({ t: "jump" })}>
        {tr("narrow_jump")}
      </button>
    </main>
  );
}
