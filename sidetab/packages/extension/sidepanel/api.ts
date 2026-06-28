// 사이드패널 ↔ 워커 API 클라이언트. 5엔드포인트 + DEV mock 스위치.
// 스트리밍 fetch는 반드시 사이드패널 페이지에서만(서비스워커는 30초 제한).
import type {
  Prompt1In, Prompt1Out, Prompt2In, Prompt2Out,
  Prompt4In, Prompt4Out, Prompt5In, Prompt5Out,
  PreviewIn, PreviewOut, RelateIn, RelateOut,
  RecommendInput, StreamEvent, ClientLimits, OutputLocale,
} from "@sidetab/shared";
import { DEFAULT_LIMITS, OUTPUT_LOCALES } from "@sidetab/shared";
import * as mock from "./mock.js";

// 출력 콘텐츠 언어. 브라우저/OS 언어에서 감지하거나 사용자가 드롭다운으로 바꾼다.
// 모든 API 호출에 x-locale 헤더로 실어 보내 워커가 LLM 출력 언어를 정한다.
let currentLocale: OutputLocale = "ko";
export function setLocale(l: OutputLocale): void { currentLocale = l; }
export function getLocale(): OutputLocale { return currentLocale; }

// navigator.language(예: "ja-JP")를 OutputLocale로 매핑한다. 미지원 언어는 영어로 폴백.
export function detectLocale(): OutputLocale {
  const raw = (navigator.language || "").toLowerCase();
  const two = raw.slice(0, 2);
  if ((OUTPUT_LOCALES as string[]).includes(two)) return two as OutputLocale;
  return "en";
}

// 워커 /config 미응답(오프라인·mock·실패) 시 쓰는 클라이언트 기본 한도.
export const DEFAULT_CLIENT_LIMITS: ClientLimits = {
  narrowMax: DEFAULT_LIMITS.narrowMax,
  detailLimitFree: DEFAULT_LIMITS.detailLimitFree,
  freeWeeklyLimit: DEFAULT_LIMITS.freeWeeklyLimit,
  maxTotal: DEFAULT_LIMITS.maxTotal,
  groupGen: DEFAULT_LIMITS.groupGen,
  maxContextChars: DEFAULT_LIMITS.maxContextChars,
};

// 배포 후 실제 워커 도메인으로 교체. manifest host_permissions와 일치해야 CORS가 열린다.
// VITE_WORKER_BASE를 주면(예: 로컬 wrangler dev) 그 주소를 쓰고 실 API로 붙는다.
const WORKER_BASE = (import.meta.env.VITE_WORKER_BASE as string | undefined) ?? "https://sidetab-api.example.workers.dev";
// DEV(vite dev)에서는 기본 mock. 단 VITE_WORKER_BASE가 주어지면 dev라도 실 워커로 fetch.
const USE_MOCK = import.meta.env.DEV && !import.meta.env.VITE_WORKER_BASE;

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
  return { "Content-Type": "application/json", "x-user-id": await getUserId(), "x-tier": tier, "x-locale": currentLocale };
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

// 워커 운영 한도(클라이언트 게이팅용)를 읽는다. 실패 시 기본값으로 폴백한다(앱 동작은 막지 않음).
export async function getConfig(): Promise<ClientLimits> {
  if (USE_MOCK) return DEFAULT_CLIENT_LIMITS;
  try {
    const res = await fetch(`${WORKER_BASE}/config`, { method: "GET" });
    if (!res.ok) return DEFAULT_CLIENT_LIMITS;
    return (await res.json()) as ClientLimits;
  } catch {
    return DEFAULT_CLIENT_LIMITS;
  }
}

// 분류 호출. tier를 실제 플랜대로 보낸다(pro는 paid). free로 고정하면 pro 사용자도 주간 한도에 집계돼 7회 뒤 새 탐색이 막히던 버그가 난다.
export async function classify(input: Prompt1In, tier: Tier = "free"): Promise<Prompt1Out> {
  if (USE_MOCK) return mock.classify(input);
  return postJson<Prompt1In, Prompt1Out>("/classify", input, tier);
}

export async function nextBranch(input: Prompt2In): Promise<Prompt2Out> {
  if (USE_MOCK) return mock.nextBranch(input);
  return postJson<Prompt2In, Prompt2Out>("/next", input, "free");
}

// 난이도 선택 직전 깊이별 대표 어휘 프리뷰. 한도 미집계라 free 티어로 보낸다.
export async function preview(input: PreviewIn): Promise<PreviewOut> {
  if (USE_MOCK) return mock.preview(input);
  return postJson<PreviewIn, PreviewOut>("/preview", input, "free");
}

// 연결 턴(프로젝트 kept 어휘가 현재 좁힌 작업과 연결되는지 판정). 한도 미집계라 free 티어로 보낸다.
export async function relate(input: RelateIn): Promise<RelateOut> {
  if (USE_MOCK) return mock.relate(input);
  return postJson<RelateIn, RelateOut>("/relate", input, "free");
}

export async function detail(input: Prompt5In, tier: Tier): Promise<Prompt5Out> {
  if (USE_MOCK) return mock.detail(input);
  return postJson<Prompt5In, Prompt5Out>("/detail", input, tier);
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
