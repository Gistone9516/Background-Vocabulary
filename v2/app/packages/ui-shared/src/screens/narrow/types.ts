// 좁히기 상태 기계의 타입. 상태와 이벤트와 명령만 있고 동작은 machine.ts에 있다.

import type { Choice, Prompt1In, Prompt1Out, Prompt2In, Prompt2Out } from "@vock/shared";
import type { ApiError } from "../../api/index.js";

export interface Question {
  question: string;
  choices: Choice[];
}

// 한 턴의 답. "어려워요"는 답이 아니라 난이도 신호라서 종류를 나눈다.
// 이 구분이 있어야 질문 횟수를 셀 때 신호를 제외할 수 있다(스펙 D-2).
export type AnswerTurn = { kind: "picks"; labels: string[] } | { kind: "tooHard" };

// 좁히기가 만들어 내는 값. 끝나면 통째로 다음 화면에 넘어간다.
// 남은 턴 수는 여기 없다. answers에서 계산한다(스펙 D-4). 저장하지 않으면 어긋날 수 없다.
export interface NarrowCtx {
  sessionId: string;
  cond: string;
  classifyOut: Prompt1Out;
  firstQuestion: Question; // 되돌리기가 돌아갈 지점
  answers: AnswerTurn[];
  simplify: boolean;
  usedUndo: boolean;
  confidence: number;
}

// 지금 턴에서 사용자가 고른 것. 확정 전까지의 임시값이라 ctx에 넣지 않는다.
export interface Picks {
  selected: string[];
  custom: string;
  tooHard: boolean;
}

export type DoneReason = "enough" | "exhausted" | "user_jump" | "malformed";

// 실패 후 무엇을 다시 부를지. 재시도가 가능하려면 원래 요청을 복원할 수 있어야 한다.
export type RetryOf =
  | { kind: "classify"; sessionId: string; raw: string; cond: string }
  | { kind: "next"; ctx: NarrowCtx; question: Question };

export type NarrowState =
  | { phase: "idle" }
  | { phase: "classifying"; runId: number; sessionId: string; raw: string; cond: string }
  | { phase: "asking"; runId: number; ctx: NarrowCtx; question: Question; picks: Picks }
  | { phase: "advancing"; runId: number; ctx: NarrowCtx; question: Question }
  | { phase: "failed"; runId: number; error: ApiError; retryOf: RetryOf }
  | { phase: "done"; ctx: NarrowCtx; reason: DoneReason };

export type NarrowEvent =
  | { t: "submit"; sessionId: string; raw: string; cond: string }
  | { t: "classified"; runId: number; out: Prompt1Out }
  | { t: "advanced"; runId: number; out: Prompt2Out }
  | { t: "failed"; runId: number; error: ApiError }
  | { t: "toggle"; label: string }
  | { t: "custom"; text: string }
  | { t: "tooHard" }
  | { t: "confirm" }
  | { t: "undo" }
  | { t: "jump" }
  | { t: "retry" }
  | { t: "leave" };

export type NarrowCmd =
  | { c: "callClassify"; runId: number; input: Prompt1In }
  | { c: "callNext"; runId: number; input: Prompt2In }
  | { c: "abort"; runId: number }
  | { c: "saveSnapshot"; ctx: NarrowCtx }
  | { c: "goRefusal" }
  | { c: "goEntryWithNotice"; notice: "weekly" }
  | { c: "goHandoff"; ctx: NarrowCtx; reason: DoneReason };

// 종료 판정에 필요한 값. 티어별 상한은 호출부가 미리 풀어서 넘긴다.
export interface NarrowConfig {
  narrowMin: number;
  narrowMax: number;
}

export const EMPTY_PICKS: Picks = { selected: [], custom: "", tooHard: false };
