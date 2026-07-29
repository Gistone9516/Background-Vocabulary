// 어휘 생성 스트리밍의 타입. 상태와 이벤트와 명령만 있고 동작은 machine.ts에 있다.

import type { RecommendInput, StreamEvent, Term } from "@vock/shared";
import type { ApiError } from "../../api/index.js";

// 화면에서 카드를 구분하기 위한 식별자만 덧붙인다. 서버가 준 값은 건드리지 않는다.
export interface TermCard extends Term {
  id: string;
}

export type SettleReason = "done" | "capped" | "aborted";

// 로딩과 오류가 동시에 참일 수 없다. v1은 streaming과 errorMsg가 독립 필드라
// 둘 다 참인 상태가 표현 가능했고 실제로 그 상태가 화면에 나왔다(코드규약 8절).
export type TermsState =
  | { phase: "idle" }
  | { phase: "streaming"; runId: number; items: TermCard[]; append: boolean }
  | { phase: "settled"; items: TermCard[]; reason: SettleReason }
  | { phase: "failed"; items: TermCard[]; error: ApiError };

export type TermsEvent =
  | { t: "start"; input: RecommendInput; append: boolean }
  // 저장된 세션의 어휘 목록 되살리기(FR-702). 스트림을 열지 않는다.
  | { t: "restore"; items: Term[] }
  | { t: "event"; runId: number; ev: StreamEvent }
  | { t: "failed"; runId: number; error: ApiError }
  | { t: "watchdog"; runId: number }
  | { t: "leave" };

export type TermsCmd =
  | { c: "openStream"; runId: number; input: RecommendInput }
  | { c: "abort"; runId: number }
  | { c: "armWatchdog"; runId: number }
  | { c: "goRefusal" }
  | { c: "completeSession"; items: TermCard[] };

export interface TermsConfig {
  maxTotal: number;
}

export const HIGH_RISK_CODE = "HIGH_RISK_REFUSED";
