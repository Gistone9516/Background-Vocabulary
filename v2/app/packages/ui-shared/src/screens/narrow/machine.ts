// 좁히기 전이 규칙. 순수 함수 하나로 모여 있다.
// 네트워크도 타이머도 난수도 현재 시각도 쓰지 않는다. 부를 것이 있으면 명령으로 돌려주고 실행은 러너가 한다.
// 그래서 서버 없이 전이 전체를 검증할 수 있다(scripts/e2e-narrow.mjs).

import type { Prompt1In, Prompt2In } from "@vock/shared";
import { decideNext, isUsableQuestion, realAnswers } from "./decide.js";
import {
  EMPTY_PICKS,
  type AnswerTurn,
  type DoneReason,
  type NarrowCmd,
  type NarrowConfig,
  type NarrowCtx,
  type NarrowEvent,
  type NarrowState,
  type Question,
} from "./types.js";

const NONE: NarrowCmd[] = [];

function liveRun(s: NarrowState): number {
  return "runId" in s ? s.runId : 0;
}

function toHistory(answers: AnswerTurn[]): { label: string; action: "선택" }[] {
  const out: { label: string; action: "선택" }[] = [];
  for (const a of answers) {
    if (a.kind !== "picks") continue; // 난이도 신호는 답이 아니라 서버로 보내지 않는다
    for (const label of a.labels) out.push({ label, action: "선택" });
  }
  return out;
}

function classifyIn(raw: string, cond: string, context?: string): Prompt1In {
  return { raw_input: raw, ...(cond ? { user_condition: cond } : {}), ...(context ? { context_object: context } : {}) };
}

function nextIn(ctx: NarrowCtx): Prompt2In {
  return {
    domain: ctx.classifyOut.domain ?? "",
    job_type: ctx.classifyOut.job_type ?? [],
    history: toHistory(ctx.answers),
    ...(ctx.cond ? { user_condition: ctx.cond } : {}),
    ...(ctx.context ? { context_object: ctx.context } : {}),
    ...(ctx.simplify ? { simplify: true } : {}),
  };
}

function questionOf(out: { question: string; choices: Question["choices"] }): Question {
  return { question: out.question, choices: out.choices };
}

// 실패가 화면을 옮기는 경우는 둘뿐이다. 나머지는 제자리에서 다시 시도한다(스펙 D-7).
function navOnFailure(e: { kind: string }): NarrowCmd[] | null {
  if (e.kind === "weekly_exhausted") return [{ c: "goEntryWithNotice", notice: "weekly" }];
  if (e.kind === "high_risk") return [{ c: "goRefusal" }];
  return null;
}

// 탈출구 라벨은 상수가 아니라 cfg로 들어온다(S-34). 상태 기계는 로케일을 모르고, 알아야 할 이유도 없다.
// 이 자리에 문자열 상수가 있던 동안 그 하나가 라벨·필터·서버 본문·게이트 단언 네 곳을 겸했고,
// 번역하는 순간 필터가 조용히 어긋날 상태였다. 판정은 이제 choices의 escape 표식으로 한다.

// 좁히기를 끝낸다. 연결 턴을 켠 경우에만 한 턴이 끼어들고, 그 외에는 곧장 넘긴다.
// 종료 경로가 여러 곳에 흩어지면 연결 턴이 어떤 경로에서만 빠지는 일이 생긴다.
function finish(runId: number, ctx: NarrowCtx, reason: DoneReason, cfg: NarrowConfig): [NarrowState, NarrowCmd[]] {
  if (cfg.connect) {
    return [{ phase: "relating", runId, ctx, reason }, [{ c: "callRelate", runId, ctx }]];
  }
  return [
    { phase: "done", ctx, reason },
    [{ c: "saveSnapshot", ctx, question: null }, { c: "goHandoff", ctx, reason }],
  ];
}

// 연결 턴을 건너뛰고 원래 사유로 끝낸다. 실패와 "관련 없음"이 같은 길을 쓴다(S-12).
function skipRelate(ctx: NarrowCtx, reason: DoneReason): [NarrowState, NarrowCmd[]] {
  return [
    { phase: "done", ctx, reason },
    [{ c: "saveSnapshot", ctx, question: null }, { c: "goHandoff", ctx, reason }],
  ];
}

export function reduce(s: NarrowState, e: NarrowEvent, cfg: NarrowConfig): [NarrowState, NarrowCmd[]] {
  // 응답이 자기 요청의 것이 아니면 통째로 버린다(스펙 B-8).
  // 이 대조가 여기 한 곳에만 있다. v1은 같은 가드를 세 곳에 복사해 두고 주석으로 방어했다.
  if (e.t === "classified" || e.t === "advanced" || e.t === "failed") {
    if (e.runId !== liveRun(s)) return [s, NONE];
  }

  switch (e.t) {
    case "leave": {
      if (s.phase === "idle") return [s, NONE];
      return [{ phase: "idle" }, [{ c: "abort", runId: liveRun(s) }]];
    }

    // 이어하기는 분류를 건너뛰고 저장된 맥락으로 바로 질문 화면에 앉는다(스펙 S-6).
    // runId를 올려 두어야 이전 세션의 늦은 응답이 이 화면에 섞이지 않는다.
    case "resume": {
      return [
        { phase: "asking", runId: liveRun(s) + 1, ctx: e.ctx, question: e.question, picks: EMPTY_PICKS },
        [{ c: "abort", runId: liveRun(s) }],
      ];
    }

    case "submit": {
      // 분류 중 재제출은 전이가 없다. 연타 방지 플래그 없이 구조로 막힌다(스펙 B-1).
      if (s.phase === "classifying") return [s, NONE];
      const runId = liveRun(s) + 1;
      return [
        { phase: "classifying", runId, sessionId: e.sessionId, raw: e.raw, cond: e.cond, ...(e.context ? { context: e.context } : {}) },
        [{ c: "callClassify", runId, input: classifyIn(e.raw, e.cond, e.context) }],
      ];
    }

    case "classified": {
      if (s.phase !== "classifying") return [s, NONE];
      // 고위험은 세션도 과금도 만들지 않는다(스펙 B-2).
      if (e.out.domain_risk === "high") return [{ phase: "idle" }, [{ c: "goRefusal" }]];

      const usable = isUsableQuestion(e.out);
      const first: Question = usable ? questionOf(e.out) : { question: "", choices: [] };
      const ctx: NarrowCtx = {
        sessionId: s.sessionId,
        topic: s.raw,
        cond: s.cond,
        ...(s.context ? { context: s.context } : {}),
        classifyOut: e.out,
        firstQuestion: first,
        answers: [],
        simplify: false,
        usedUndo: false,
        confidence: 0,
      };
      // 첫 질문 형태가 깨지면 좁히기를 건너뛰고 바로 넘긴다(스펙 B-5).
      if (!usable) {
        return [
          { phase: "done", ctx, reason: "malformed" },
          [{ c: "saveSnapshot", ctx, question: null }, { c: "goHandoff", ctx, reason: "malformed" }],
        ];
      }
      // 0답 상태도 저장한다. 여기서 이탈해도 재개할 수 있어야 한다(스펙 B-13).
      return [{ phase: "asking", runId: s.runId, ctx, question: first, picks: EMPTY_PICKS }, [{ c: "saveSnapshot", ctx, question: first }]];
    }

    case "toggle": {
      if (s.phase !== "asking") return [s, NONE];
      const has = s.picks.selected.includes(e.label);
      const selected = has ? s.picks.selected.filter((x) => x !== e.label) : [...s.picks.selected, e.label];
      // 일반 선택을 누르면 난이도 신호는 풀린다(스펙 B-15).
      return [{ ...s, picks: { ...s.picks, selected, tooHard: false } }, NONE];
    }

    case "custom": {
      if (s.phase !== "asking") return [s, NONE];
      return [{ ...s, picks: { ...s.picks, custom: e.text, tooHard: false } }, NONE];
    }

    case "tooHard": {
      if (s.phase !== "asking" || s.connect !== undefined) return [s, NONE];
      // 이미 쉬운 모드면 누를 것이 없다. 두 번째 누름은 정보가 없고 서버 비용만 든다(스펙 D-5).
      if (s.ctx.simplify) return [s, NONE];
      return [{ ...s, picks: { selected: [], custom: "", tooHard: true } }, NONE];
    }

    case "confirm": {
      if (s.phase !== "asking") return [s, NONE];
      const runId = s.runId + 1;

      // 연결 턴의 답은 좁히기 예산을 쓰지 않는다. 좁히기는 이미 끝났고
      // 이 답은 상세 설명에 얹을 방향일 뿐이다(connection_hint).
      if (s.connect !== undefined) {
        const picked = [...s.picks.selected, s.picks.custom.trim()].filter(Boolean);
        // 이 질문에 실제로 렌더된 탈출구 라벨과 비교한다. 모듈 상수와 비교하면 라벨이 번역된 순간
        // 어긋나지만, 자기 질문의 choices에서 찾으면 어느 언어로 렌더됐든 맞는다(S-34).
        const escapeLabel = s.question.choices.find((c) => c.escape)?.label;
        const chosen = picked.filter((l) => l !== escapeLabel);
        const ctx: NarrowCtx = chosen.length ? { ...s.ctx, connection: chosen.join(", ") } : s.ctx;
        return skipRelate(ctx, s.connect);
      }

      if (s.picks.tooHard) {
        // 난이도 신호는 질문 횟수도 예산도 쓰지 않는다(스펙 D-2). 쉬운 모드는 이후 턴에 계속 적용된다.
        const ctx: NarrowCtx = { ...s.ctx, answers: [...s.ctx.answers, { kind: "tooHard" }], simplify: true };
        return [{ phase: "advancing", runId, ctx, question: s.question }, [{ c: "callNext", runId, input: nextIn(ctx) }]];
      }

      // 칩 선택과 직접 입력을 합산한다(스펙 B-10).
      const custom = s.picks.custom.trim();
      const labels = custom ? [...s.picks.selected, custom] : [...s.picks.selected];
      if (labels.length === 0) return [s, NONE]; // 고른 것이 없으면 진행하지 않는다(스펙 B-16)

      const ctx: NarrowCtx = { ...s.ctx, answers: [...s.ctx.answers, { kind: "picks", labels }] };
      return [{ phase: "advancing", runId, ctx, question: s.question }, [{ c: "callNext", runId, input: nextIn(ctx) }]];
    }

    case "advanced": {
      if (s.phase !== "advancing") return [s, NONE];
      const confidence = Number.isFinite(e.out.confidence) ? e.out.confidence : s.ctx.confidence;
      const ctx: NarrowCtx = { ...s.ctx, confidence };
      const d = decideNext({ answers: ctx.answers, out: e.out, cfg });
      if (d.done) return finish(s.runId, ctx, d.reason, cfg);
      // 다음 질문이 뜬 상태를 저장한다(스펙 B-13).
      return [
        { phase: "asking", runId: s.runId, ctx, question: questionOf(e.out), picks: EMPTY_PICKS },
        [{ c: "saveSnapshot", ctx, question: questionOf(e.out) }],
      ];
    }

    case "related": {
      if (s.phase !== "relating") return [s, NONE];
      // 실패(null)와 관련 없음이 같은 처리다. 좁히기는 멈추지 않는다(S-12).
      if (!e.out || !e.out.relevant || e.out.choices.length === 0) return skipRelate(s.ctx, s.reason);
      // "관련 없어요" 탈출구는 프론트가 덧붙인다. 서버 choices에 기대지 않는다(S-13).
      const question: Question = {
        question: e.out.question,
        choices: [...e.out.choices, { label: cfg.noRelationLabel, escape: true }],
      };
      return [
        { phase: "asking", runId: s.runId, ctx: s.ctx, question, picks: EMPTY_PICKS, connect: s.reason },
        NONE,
      ];
    }

    case "failed": {
      const nav = navOnFailure(e.error);
      if (s.phase === "classifying") {
        if (nav) return [{ phase: "idle" }, nav];
        return [
          { phase: "failed", runId: s.runId, error: e.error, retryOf: { kind: "classify", sessionId: s.sessionId, raw: s.raw, cond: s.cond, ...(s.context ? { context: s.context } : {}) } },
          NONE,
        ];
      }
      if (s.phase === "advancing") {
        if (nav) return [{ phase: "idle" }, nav];
        // 일시적 실패로 좁히기를 끝내지 않는다. 답변은 그대로 두고 제자리에 머문다(스펙 D-7).
        return [
          { phase: "failed", runId: s.runId, error: e.error, retryOf: { kind: "next", ctx: s.ctx, question: s.question } },
          NONE,
        ];
      }
      return [s, NONE];
    }

    case "retry": {
      if (s.phase !== "failed") return [s, NONE];
      const runId = s.runId + 1;
      if (s.retryOf.kind === "classify") {
        const { sessionId, raw, cond, context } = s.retryOf;
        return [
          { phase: "classifying", runId, sessionId, raw, cond, ...(context ? { context } : {}) },
          [{ c: "callClassify", runId, input: classifyIn(raw, cond, context) }],
        ];
      }
      const { ctx, question } = s.retryOf;
      return [{ phase: "advancing", runId, ctx, question }, [{ c: "callNext", runId, input: nextIn(ctx) }]];
    }

    case "undo": {
      if (s.phase !== "asking" || s.connect !== undefined) return [s, NONE];
      // 세션당 1회. 한 단계가 아니라 첫 질문으로 돌아간다. 한 단계씩 되돌리면
      // 다시 진행할 때마다 서버를 부르게 되어 왕복 비용이 통제 불능이 된다(스펙 D-1).
      if (s.ctx.usedUndo || s.ctx.answers.length === 0) return [s, NONE];
      // 쓴 예산은 돌려주지 않는다(스펙 B-11). 그래서 답을 지우지 않고 버린 것으로 표시한다 —
      // 배열을 비우면 남은 턴이 그 배열에서 파생되므로 비우는 순간이 곧 환불이 된다.
      // 쉬운 모드는 유지한다.
      const answers: AnswerTurn[] = s.ctx.answers.map((a) => (a.kind === "picks" ? { kind: "discarded" } : a));
      const ctx: NarrowCtx = { ...s.ctx, answers, usedUndo: true, confidence: 0 };
      return [{ phase: "asking", runId: s.runId, ctx, question: ctx.firstQuestion, picks: EMPTY_PICKS }, NONE];
    }

    case "jump": {
      if (s.phase !== "asking") return [s, NONE];
      // 사용자가 직접 끊은 것이라 종료 사유를 따로 알리지 않는다(스펙 D-9).
      return [
        { phase: "done", ctx: s.ctx, reason: "user_jump" },
        [{ c: "saveSnapshot", ctx: s.ctx, question: null }, { c: "goHandoff", ctx: s.ctx, reason: "user_jump" }],
      ];
    }

    default:
      return [s, NONE];
  }
}

export const initialNarrow: NarrowState = { phase: "idle" };

// 화면이 쓰는 파생값. 되돌리기 버튼에 남을 질문 수를 적어 주기 위해서다(스펙 D-8).
export function answeredCount(ctx: NarrowCtx): number {
  return realAnswers(ctx.answers);
}
