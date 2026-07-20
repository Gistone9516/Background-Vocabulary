// SSE wire fixture. 0단계 산출물.
// D(사이드패널)는 이 wire 텍스트를 목으로 써서 백엔드 없이 파싱과 렌더를 독립 개발한다.
// 어댑터(C)가 StreamEvent를 이 형식의 바이트로 직렬화하고, 사이드패널이 다시 파싱한다.

import type { StreamEvent, Term } from "./types.js";

// StreamEvent 하나를 SSE 라인으로 직렬화한다.
export function toSseLine(ev: StreamEvent): string {
  return `data: ${JSON.stringify(ev)}\n\n`;
}

// StreamEvent 배열을 SSE wire 텍스트로(종료 마커 포함).
export function toSseWire(events: StreamEvent[]): string {
  return events.map(toSseLine).join("") + "data: [DONE]\n\n";
}

// 샘플 term 2개. G1 스모크의 로봇 제어 결과에서 가져온 실제 형태.
export const SAMPLE_TERMS: Term[] = [
  {
    term: "안티와인드업 (Anti-Windup)",
    kind: "기법",
    priority: 1,
    why: "PID 제어에서 적분기 와인드업을 방지하는 핵심 기법.",
    one_line: "출력이 제한될 때 적분기의 과도한 축적을 막아 안정성을 높이는 방법",
    tag: "몰라",
    direction: "출력 제한이 있는 시스템에서 필수적",
    context_note: "백계산 같은 구체적 방식 이해가 필요",
  },
  {
    term: "적분기 와인드업 (Integrator Windup)",
    kind: "현상",
    priority: 2,
    why: "PID 제어의 일반적 문제점. 문제해결의 출발점.",
    one_line: "출력이 포화되어도 적분이 계속되어 오버슈트나 느린 응답을 유발하는 현상",
    tag: "몰라",
  },
];

// happy-path: term 두 개가 순서대로 흐르고 done으로 끝난다.
export const SSE_HAPPY: string = toSseWire([
  { type: "term", term: SAMPLE_TERMS[0]! },
  { type: "term", term: SAMPLE_TERMS[1]! },
  { type: "done" },
]);

// error-path: term 한 개 흐른 뒤 업스트림 오류로 종료(부분 출력 + 에러 이벤트).
export const SSE_ERROR: string = toSseWire([
  { type: "term", term: SAMPLE_TERMS[0]! },
  { type: "error", code: "UPSTREAM_429", message: "DeepSeek rate limited" },
]);
