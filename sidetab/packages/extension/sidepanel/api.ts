// 사이드패널 ↔ 워커 API 클라이언트. 5엔드포인트 + DEV mock 스위치.
// 스트리밍 fetch는 반드시 사이드패널 페이지에서만(서비스워커는 30초 제한).
import type {
  Prompt1In, Prompt1Out, Prompt2In, Prompt2Out,
  Prompt4In, Prompt4Out, Prompt5In, Prompt5Out,
  RecommendInput, StreamEvent,
} from "@sidetab/shared";
import * as mock from "./mock.js";

// 배포 후 실제 워커 도메인으로 교체. manifest host_permissions와 일치해야 CORS가 열린다.
const WORKER_BASE = "https://sidetab-api.example.workers.dev";
// DEV(vite dev)에서는 mock을 쓴다. 빌드(프로덕션)에서는 실제 워커로 fetch.
const USE_MOCK = import.meta.env.DEV;

export type Tier = "free" | "paid";

// 설치 UUID. chrome.storage.local 우선, 없으면(개발 브라우저) localStorage 폴백.
export async function getUserId(): Promise<string> {
  const g = (globalThis as { chrome?: typeof chrome }).chrome;
  if (g?.storage?.local) {
    return new Promise((resolve) => {
      g.storage.local.get("userId", (r: Record<string, unknown>) => {
        if (r["userId"]) return resolve(r["userId"] as string);
        const id = crypto.randomUUID();
        g.storage.local.set({ userId: id }, () => resolve(id));
      });
    });
  }
  let id = localStorage.getItem("userId");
  if (!id) { id = crypto.randomUUID(); localStorage.setItem("userId", id); }
  return id;
}

async function headers(tier: Tier): Promise<Record<string, string>> {
  return { "Content-Type": "application/json", "x-user-id": await getUserId(), "x-tier": tier };
}

async function postJson<I, O>(path: string, body: I, tier: Tier): Promise<O> {
  const res = await fetch(`${WORKER_BASE}${path}`, {
    method: "POST", headers: await headers(tier), body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw Object.assign(new Error(text || `HTTP ${res.status}`), { status: res.status });
  }
  return (await res.json()) as O;
}

export async function classify(input: Prompt1In): Promise<Prompt1Out> {
  if (USE_MOCK) return mock.classify(input);
  return postJson<Prompt1In, Prompt1Out>("/classify", input, "free");
}

export async function nextBranch(input: Prompt2In): Promise<Prompt2Out> {
  if (USE_MOCK) return mock.nextBranch(input);
  return postJson<Prompt2In, Prompt2Out>("/next", input, "free");
}

export async function detail(input: Prompt5In): Promise<Prompt5Out> {
  if (USE_MOCK) return mock.detail(input);
  return postJson<Prompt5In, Prompt5Out>("/detail", input, "free");
}

// /summarize는 유료 전용(D3). 무료 호출은 워커가 402로 거부한다.
export async function summarize(input: Prompt4In, tier: Tier): Promise<Prompt4Out> {
  if (USE_MOCK) return mock.summarize(input);
  return postJson<Prompt4In, Prompt4Out>("/summarize", input, tier);
}

// /recommend SSE. term 단위로 onEvent를 호출한다. signal로 취소.
export async function streamRecommend(
  input: RecommendInput,
  tier: Tier,
  onEvent: (ev: StreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  if (USE_MOCK) return mock.streamRecommend(input, onEvent, signal);

  const res = await fetch(`${WORKER_BASE}/recommend`, {
    method: "POST", headers: await headers(tier), body: JSON.stringify(input), signal,
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => res.statusText);
    onEvent({ type: "error", code: `HTTP_${res.status}`, message: msg });
    return;
  }
  if (!res.body) { onEvent({ type: "error", code: "NO_BODY", message: "응답 body가 없습니다." }); return; }

  const reader = res.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const t = line.trimEnd();
        if (t === "" || t.startsWith(":")) continue;
        if (!t.startsWith("data: ")) continue;
        const raw = t.slice("data: ".length);
        if (raw === "[DONE]") return;
        try { onEvent(JSON.parse(raw) as StreamEvent); } catch { /* 불완전 청크는 다음 줄에서 이어짐 */ }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
