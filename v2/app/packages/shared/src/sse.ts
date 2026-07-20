// SSE wire 직렬화. 어댑터가 StreamEvent를 이 형식의 바이트로 직렬화하고, 프론트가 다시 파싱한다.

import type { StreamEvent } from "./types/index.js";

// StreamEvent 하나를 SSE 라인으로 직렬화한다.
export function toSseLine(ev: StreamEvent): string {
  return `data: ${JSON.stringify(ev)}\n\n`;
}

// StreamEvent 배열을 SSE wire 텍스트로(종료 마커 포함).
export function toSseWire(events: StreamEvent[]): string {
  return events.map(toSseLine).join("") + "data: [DONE]\n\n";
}
