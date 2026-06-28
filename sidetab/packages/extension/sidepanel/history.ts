// 담은 어휘(Keep) 세션 저장소. chrome.storage.local 우선, 없으면(개발 브라우저) localStorage 폴백.
// 저장 패턴은 api.ts getUserId를 그대로 본떴다. 서버 변경 없이 클라이언트에만 영속한다.
import type { Prompt5Out, Prompt1Out, Choice } from "@sidetab/shared";

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
// 아키네이터 좁히기 진행 스냅샷. 어휘 생성(done) 전까지 존재하며, 이걸로 좁히기를 이어서 진행한다.
// narrow가 있으면 그 세션은 "진행 중"이고, 생성이 끝나면(done) 제거돼 "완료" 세션이 된다.
export interface NarrowSnap {
  classifyOut: Prompt1Out;
  questions: { question: string; choices: Choice[] }[];
  answers: string[][];
  unchosen: string[][];
  usedUndo: boolean;
  tooHard: boolean;
  simplify: boolean;
  refining: boolean;
  confidence: number;
  turnsLeft: number;
  cond?: string;
}

// 한 번의 탐색 = 한 세션. topic은 진입에서 입력한 텍스트(인덱스 역할).
// updatedAt은 마지막 진행/생성 시각으로, 목록 정렬과 CAP 보호 기준이다(진행 중 세션이 자연히 상위에 남는다).
export interface SessionRec {
  id: string;
  topic: string;
  area: string;
  locale: string;
  createdAt: number;
  updatedAt: number;
  terms: KeptTerm[];          // 담은(kept) 어휘
  generated?: KeptTerm[];     // 생성한 전체 어휘 리스트(되돌아가서 다시 보기용). 각 어휘의 kept 여부는 terms 멤버십으로 판단한다.
  narrow?: NarrowSnap;
  pinned?: boolean;           // 세션 고정(핀). 세션 화면 상단 고정 버킷에 모이고 CAP 정리에서 보호된다.
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

// 한 세션을 id 기준 upsert 후 전체를 다시 반환한다.
// 진행 중(narrow 있음)이거나 담은 어휘가 있으면 보존하고, 둘 다 비면 제거한다.
export async function saveSession(rec: SessionRec): Promise<SessionRec[]> {
  const list = await loadSessions();
  const rest = list.filter((s) => s.id !== rec.id);
  const keep = rec.narrow != null || rec.terms.length > 0 || (rec.generated?.length ?? 0) > 0;
  const merged = keep ? [rec, ...rest] : rest;
  const sorted = merged.sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
  const capped = capToLimit(sorted, CAP);
  await writeAll(capped);
  return capped;
}

// CAP 적용 시 진행 중(narrow 있음)·고정(pinned) 세션을 보호한다. 진행 중 세션은 주간 한도를 이미 차감한
// 결제분이고 고정 세션은 사용자가 의도적으로 남긴 것이라, 오래됐다는 이유로 조용히 사라지면 안 된다.
// 그래서 초과분은 보호 대상이 아닌 완료 세션부터 오래된 순으로 먼저 덜어낸다.
// 보호 세션만으로 CAP를 넘기는 비현실적 경우에만 오래된 보호 세션을 덜어낸다.
function capToLimit(sorted: SessionRec[], cap: number): SessionRec[] {
  if (sorted.length <= cap) return sorted;
  const overflow = sorted.length - cap;
  // sorted는 최신순이므로, 보호 대상이 아닌 완료 세션을 오래된 순(역순)으로 모아 초과분만큼 제거 대상에 담는다.
  const completedOldestFirst = sorted.filter((s) => s.narrow == null && s.pinned !== true).slice().reverse();
  const dropIds = new Set(completedOldestFirst.slice(0, overflow).map((s) => s.id));
  let result = sorted.filter((s) => !dropIds.has(s.id));
  if (result.length > cap) result = result.slice(0, cap); // 진행 중만 초과하면 오래된 진행 중을 덜어낸다.
  return result;
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
  return (v as SessionRec[])
    .filter((s) => s && typeof s.id === "string")
    .map((s) => ({ ...s, updatedAt: s.updatedAt ?? s.createdAt })) // 구버전 레코드는 updatedAt이 없어 createdAt으로 보충
    .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
}

function safeParse(s: string | null): unknown {
  if (!s) return [];
  try { return JSON.parse(s); } catch { return []; }
}
