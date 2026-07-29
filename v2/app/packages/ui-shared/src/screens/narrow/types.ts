// 좁히기 상태 기계의 타입. 상태와 이벤트와 명령만 있고 동작은 machine.ts에 있다.

import type { AnswerTurn, Question, Prompt1In, Prompt1Out, Prompt2In, Prompt2Out, RelateOut } from "@vock/shared";
import type { ApiError } from "../../api/index.js";

// 질문 정의는 shared가 갖는다. 저장 형태와 화면 형태가 같아야 한다(S5 S-20).
export type { Question } from "@vock/shared";

// 한 턴의 답. "어려워요"는 답이 아니라 난이도 신호라서 종류를 나눈다.
// 이 구분이 있어야 질문 횟수를 셀 때 신호를 제외할 수 있다(스펙 D-2).
// 저장 형태와 같아야 하므로 정의는 shared가 갖는다(S5 S-23).
export type { AnswerTurn } from "@vock/shared";

// 좁히기가 만들어 내는 값. 끝나면 통째로 다음 화면에 넘어간다.
// 남은 턴 수는 여기 없다. answers에서 계산한다(스펙 D-4). 저장하지 않으면 어긋날 수 없다.
export interface NarrowCtx {
  sessionId: string;
  topic: string; // 사용자가 처음 적은 문장. 뒤 단계가 앵커 회피와 캐시 키에 쓴다
  cond: string;
  classifyOut: Prompt1Out;
  firstQuestion: Question; // 되돌리기가 돌아갈 지점
  answers: AnswerTurn[];
  simplify: boolean;
  usedUndo: boolean;
  confidence: number;
  // 연결 턴에서 고른 방향. 카드 상세가 connection_hint로 약하게 반영한다(S3b).
  connection?: string;
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
  // connect가 있으면 이 질문은 연결 턴이고, 답하면 그 사유로 좁히기가 끝난다(S5 S-11).
  // 별도 phase를 만들지 않는 이유: 선택·직접입력 처리가 똑같아서 복제하면 두 벌이 된다.
  | { phase: "asking"; runId: number; ctx: NarrowCtx; question: Question; picks: Picks; connect?: DoneReason }
  // 연결 턴 조회 중. 실패하거나 관련이 없으면 그대로 끝난다(S-12).
  | { phase: "relating"; runId: number; ctx: NarrowCtx; reason: DoneReason }
  | { phase: "advancing"; runId: number; ctx: NarrowCtx; question: Question }
  | { phase: "failed"; runId: number; error: ApiError; retryOf: RetryOf }
  | { phase: "done"; ctx: NarrowCtx; reason: DoneReason };

export type NarrowEvent =
  | { t: "submit"; sessionId: string; raw: string; cond: string }
  // 저장된 세션 이어하기(S5 S-6). /classify를 다시 부르지 않으므로 ctx를 통째로 받는다.
  | { t: "resume"; ctx: NarrowCtx; question: Question }
  | { t: "classified"; runId: number; out: Prompt1Out }
  | { t: "advanced"; runId: number; out: Prompt2Out }
  // 연결 턴 응답. null이면 실패이며, relevant:false와 똑같이 건너뛴다 —
  // 건너뛰는 길이 하나뿐이라 한쪽만 처리하는 실수가 생길 수 없다(S-12).
  | { t: "related"; runId: number; out: RelateOut | null }
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
  // 연결 턴 조회. 프로젝트에 담은 어휘가 없으면 호출부가 아예 부르지 않는다(S-11).
  | { c: "callRelate"; runId: number; ctx: NarrowCtx }
  | { c: "abort"; runId: number }
  | { c: "saveSnapshot"; ctx: NarrowCtx; question: Question | null }
  | { c: "goRefusal" }
  | { c: "goEntryWithNotice"; notice: "weekly" }
  | { c: "goHandoff"; ctx: NarrowCtx; reason: DoneReason };

// 종료 판정에 필요한 값. 티어별 상한은 호출부가 미리 풀어서 넘긴다.
export interface NarrowConfig {
  narrowMin: number;
  narrowMax: number;
  // 연결 턴을 시도할지. 프로젝트에 담은 어휘가 있을 때만 true다(S-11).
  // 기계가 프로젝트를 알 필요는 없다 — 조건 판정은 프로젝트를 아는 쪽이 한다.
  connect?: boolean;
}

export const EMPTY_PICKS: Picks = { selected: [], custom: "", tooHard: false };
