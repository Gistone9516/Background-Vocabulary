// 담은 어휘(Keep) 세션 저장소. chrome.storage.local 우선, 없으면(개발 브라우저) localStorage 폴백.
// 저장 패턴은 api.ts getUserId를 그대로 본떴다. 서버 변경 없이 클라이언트에만 영속한다.
import type { Prompt5Out } from "@sidetab/shared";

// 카드 핵심 + 상세 캐시(있으면). 한 세션이 담은 어휘 하나.
export interface KeptTerm {
  term: string;
  kind: string;
  group?: string;
  one_line: string;
  why: string;
  priority: number;
  detail?: Prompt5Out;
}
// 한 번의 탐색 = 한 세션. topic은 진입에서 입력한 텍스트(인덱스 역할).
export interface SessionRec {
  id: string;
  topic: string;
  area: string;
  locale: string;
  createdAt: number;
  terms: KeptTerm[];
}

const KEY = "sidetab:sessions";
const CAP = 30; // 최근 30개만 유지한다.

function chromeLocal() {
  const g = (globalThis as { chrome?: typeof chrome }).chrome;
  return g?.storage?.local ?? null;
}

// 전체 세션을 최신순으로 반환한다.
export async function loadSessions(): Promise<SessionRec[]> {
  const cl = chromeLocal();
  if (cl) {
    return new Promise((resolve) => {
      cl.get(KEY, (r: Record<string, unknown>) => resolve(normalize(r[KEY])));
    });
  }
  return normalize(safeParse(localStorage.getItem(KEY)));
}

// 한 세션을 id 기준 upsert 후 전체를 다시 반환한다(담은 어휘가 0개면 그 세션은 제거한다).
export async function saveSession(rec: SessionRec): Promise<SessionRec[]> {
  const list = await loadSessions();
  const rest = list.filter((s) => s.id !== rec.id);
  const next = rec.terms.length > 0 ? [rec, ...rest] : rest;
  const capped = next.slice(0, CAP);
  await writeAll(capped);
  return capped;
}

// 한 세션을 id로 삭제하고 남은 전체를 반환한다.
export async function deleteSession(id: string): Promise<SessionRec[]> {
  const list = await loadSessions();
  const next = list.filter((s) => s.id !== id);
  await writeAll(next);
  return next;
}

async function writeAll(list: SessionRec[]): Promise<void> {
  const cl = chromeLocal();
  if (cl) {
    return new Promise((resolve) => cl.set({ [KEY]: list }, () => resolve()));
  }
  localStorage.setItem(KEY, JSON.stringify(list));
}

function normalize(v: unknown): SessionRec[] {
  if (!Array.isArray(v)) return [];
  return (v as SessionRec[]).filter((s) => s && typeof s.id === "string").sort((a, b) => b.createdAt - a.createdAt);
}

function safeParse(s: string | null): unknown {
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
}
