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

export const SSE_DONE_MARKER = "[DONE]";

// 증분 파서. 네트워크 청크는 이벤트 중간을 아무 데서나 자르므로 완성된 것만 순서대로 내보낸다.
// 파서를 직렬화기 옆에 두는 이유는 wire 형식을 한 파일에서만 정의하기 위해서다.
// 두 곳에 나뉘어 있으면 한쪽만 바뀌어도 조용히 어긋난다.
export function createSseParser(): { push(chunk: string): StreamEvent[]; done(): boolean } {
  let buf = "";
  let sawDone = false;

  return {
    push(chunk: string): StreamEvent[] {
      buf += chunk;
      const out: StreamEvent[] = [];
      let cut = buf.indexOf("\n\n");
      while (cut !== -1) {
        const block = buf.slice(0, cut);
        buf = buf.slice(cut + 2);
        cut = buf.indexOf("\n\n");

        for (const line of block.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          if (payload === SSE_DONE_MARKER) {
            sawDone = true;
            continue;
          }
          try {
            out.push(JSON.parse(payload) as StreamEvent);
          } catch {
            // 형태가 깨진 조각은 버린다. 하나가 깨졌다고 스트림 전체를 끊지 않는다.
          }
        }
      }
      return out;
    },
    done(): boolean {
      return sawDone;
    },
  };
}
