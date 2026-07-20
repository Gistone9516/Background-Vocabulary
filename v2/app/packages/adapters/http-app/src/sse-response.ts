// StreamEvent 스트림을 SSE(text/event-stream) Response로 직렬화한다.
// pipeThrough로 백프레셔와 취소 전파(클라 끊김 → 업스트림 취소)를 웹표준으로 위임한다.
// (로컬 node-server에서는 클라 끊김이 신호로 전달된다. Lambda 스트리밍은 끊김을 통지받지 못한다 — SoT §5, C2에서 보완.)

import type { StreamEvent } from "@vock/shared";
import { toSseLine } from "@vock/shared";

export function streamEventsToResponse(events: ReadableStream<StreamEvent>): Response {
  const encoder = new TextEncoder();
  const transform = new TransformStream<StreamEvent, Uint8Array>({
    transform(ev, controller) {
      controller.enqueue(encoder.encode(toSseLine(ev)));
    },
    flush(controller) {
      // v1 wire 관례: 이벤트 뒤에 종료 마커를 붙인다.
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
    },
  });
  const byteStream = events.pipeThrough(transform);
  return new Response(byteStream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "x-accel-buffering": "no",
    },
  });
}
