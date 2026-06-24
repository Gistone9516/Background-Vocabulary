// 사이드패널 페이지에서 Worker /recommend 엔드포인트를 SSE로 호출한다.
// 스트리밍 fetch는 반드시 사이드패널 페이지에서만 실행해야 한다.
// MV3 서비스워커는 30초 fetch 제한이 있어 긴 스트림을 처리할 수 없다.

import type { StreamEvent, RecommendInput } from "@sidetab/shared";

// 배포 후 실제 Workers 도메인으로 교체해야 한다.
// manifest.json의 host_permissions와 일치해야 CORS가 열린다.
const WORKER_BASE = "https://sidetab-api.example.workers.dev";

// 설치 UUID를 chrome.storage.local에서 읽거나, 없으면 생성해서 저장한다.
// userId 파생 전략은 구현계획 12장에서 Workers 바인딩 검증 방식으로 확정됐다.
// 현재는 설치 시 UUID 1차 방어를 구현한다.
export async function getOrCreateUserId(): Promise<string> {
  return new Promise((resolve) => {
    chrome.storage.local.get("userId", (result) => {
      if (result["userId"]) {
        resolve(result["userId"] as string);
        return;
      }
      const id = crypto.randomUUID();
      chrome.storage.local.set({ userId: id }, () => {
        resolve(id);
      });
    });
  });
}

// 무료 티어를 기본으로 사용한다. 유료 구독 구현은 Tier3(구현계획 12장) 이후다.
type Tier = "free" | "paid";

// SSE 이벤트를 파싱해 StreamEvent 배열을 콜백으로 전달한다.
// 응답 body를 getReader()로 읽고 부분 라인을 버퍼링한 뒤 "data: {json}" 줄을 파싱한다.
// ":" 로 시작하는 keep-alive 주석과 "data: [DONE]" 종료 마커는 건너뛴다.
export async function streamRecommend(
  input: RecommendInput,
  tier: Tier,
  onEvent: (ev: StreamEvent) => void,
  signal: AbortSignal
): Promise<void> {
  const userId = await getOrCreateUserId();

  const res = await fetch(`${WORKER_BASE}/recommend`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-user-id": userId,
      "x-tier": tier,
    },
    body: JSON.stringify(input),
    signal,
  });

  if (!res.ok) {
    const errorCode = `HTTP_${res.status}`;
    const errorMsg = await res.text().catch(() => res.statusText);
    onEvent({ type: "error", code: errorCode, message: errorMsg });
    return;
  }

  if (!res.body) {
    onEvent({ type: "error", code: "NO_BODY", message: "응답 body가 없습니다." });
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  // 청크 경계에서 잘린 부분 라인을 버퍼에 누적한다.
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // 줄바꿈 기준으로 분리해 완성된 줄만 처리한다.
      const lines = buffer.split("\n");
      // 마지막 요소는 아직 끝나지 않은 부분 라인이므로 다음 청크와 합친다.
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trimEnd();

        // 빈 줄(SSE 이벤트 구분자)과 keep-alive 주석은 건너뛴다.
        if (trimmed === "" || trimmed.startsWith(":")) continue;

        if (!trimmed.startsWith("data: ")) continue;

        const raw = trimmed.slice("data: ".length);

        // 종료 마커는 파싱하지 않는다.
        if (raw === "[DONE]") return;

        try {
          const ev = JSON.parse(raw) as StreamEvent;
          onEvent(ev);
        } catch {
          // JSON 파싱 실패는 조용히 건너뛴다. 불완전한 청크는 다음 줄에서 이어진다.
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
