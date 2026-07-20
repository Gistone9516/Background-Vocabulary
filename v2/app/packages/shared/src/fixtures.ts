// 테스트 픽스처. mock 어댑터와 스모크가 백엔드 없이 파싱·렌더·관통을 검증하는 데 쓴다.

import type { StreamEvent, Term } from "./types/index.js";
import { toSseWire } from "./sse.js";

// 샘플 term 2개. 스모크의 실제 형태(로봇 제어 결과)에서 가져왔다.
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
