// 개발 및 테스트용 목 스트림. 백엔드 없이 사이드패널 UI를 독립 개발할 때 쓴다.
// SSE_HAPPY와 SSE_ERROR는 shared/fixtures.ts의 실제 wire 텍스트다.
// 이 파일을 가져다 쓰면 실제 Worker 없이 파싱과 렌더를 검증할 수 있다.

import type { StreamEvent } from "@sidetab/shared";
import { SSE_HAPPY, SSE_ERROR } from "@sidetab/shared";

// 목 SSE wire 텍스트를 StreamEvent 배열로 파싱해 콜백으로 전달한다.
// delay_ms 간격으로 이벤트를 흘려 실제 스트리밍처럼 보이게 한다.
async function parseSseWire(
  wire: string,
  onEvent: (ev: StreamEvent) => void,
  signal: AbortSignal,
  delayMs = 120
): Promise<void> {
  const lines = wire.split("\n");

  for (const line of lines) {
    if (signal.aborted) return;

    const trimmed = line.trimEnd();
    if (!trimmed.startsWith("data: ")) continue;

    const raw = trimmed.slice("data: ".length);
    if (raw === "[DONE]") return;

    try {
      const ev = JSON.parse(raw) as StreamEvent;
      onEvent(ev);
      // 이벤트 사이에 지연을 줘서 스트리밍처럼 렌더된다.
      await new Promise<void>((res) => setTimeout(res, delayMs));
    } catch {
      // 파싱 실패는 건너뛴다.
    }
  }
}

// happy-path 목 스트림. term 두 개가 순서대로 흐르고 done으로 끝난다.
export async function mockStreamHappy(
  onEvent: (ev: StreamEvent) => void,
  signal: AbortSignal
): Promise<void> {
  await parseSseWire(SSE_HAPPY, onEvent, signal);
}

// error-path 목 스트림. term 하나 후 업스트림 오류로 종료된다.
export async function mockStreamError(
  onEvent: (ev: StreamEvent) => void,
  signal: AbortSignal
): Promise<void> {
  await parseSseWire(SSE_ERROR, onEvent, signal);
}
