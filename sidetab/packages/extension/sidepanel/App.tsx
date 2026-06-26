// 배경노트(Vock note) 사이드패널 — panel.html(UI 정본) 화면을 React로 이식하고 실 API에 배선.
// UI 문자열은 i18n.ts의 t()(여기선 tr)로 가져온다. LLM 콘텐츠는 워커가 출력 언어로 만든다(별개).
import { useReducer, useRef, useEffect, useState, useCallback, useMemo, type ReactNode, type DragEvent } from "react";
import type {
  Prompt1Out, Choice, Term, Prompt5Out, Tag, RecommendInput, ClientLimits, OutputLocale,
} from "@sidetab/shared";
import * as api from "./api.js";
import { DEFAULT_CLIENT_LIMITS } from "./api.js";
import { loadSessions, saveSession, deleteSession, type SessionRec, type KeptTerm } from "./history.js";
import { t as tr, LOCALE_LABELS } from "./i18n.js";
import { EXAMPLES, pickRandom } from "./examples.js";

// ---------- 타입 ----------
type Screen = "entry" | "narrow" | "terms" | "kept" | "paywall" | "refusal";
interface UITerm extends Term {
  id: string;
  kept: boolean;
  _new: boolean;
  detail?: Prompt5Out;
  detailLoading?: boolean;
}
interface Q { question: string; choices: Choice[] }
interface State {
  screen: Screen;
  input: string; cond: string; showCond: boolean; inputErr: boolean;
  attachedFile: { name: string; text: string } | null; dragging: boolean; attachNote: string;
  chipSeed: number; tutorialOpen: boolean;
  classifyOut: Prompt1Out | null;
  questions: Q[]; answers: string[][]; sel: string[];
  confidence: number; pending: boolean;
  customText: string; customOpen: boolean; // 아키네이터 직접 입력
  usedUndo: boolean; tooHard: boolean; simplify: boolean; // 되돌리기 1회·이번턴 "어려워요" 선택·세션 난이도 하향
  terms: UITerm[]; visibleCount: number; openId: string | null; opening: string | null;
  query: string; groupView: boolean; detailCount: number;
  moreLoading: boolean; moreLoaded: boolean; streaming: boolean; groupGenLoading: string; refining: boolean;
  ctxInput: string; copied: boolean; copyFailed: boolean; shareNote: boolean;
  aiSummary: string; aiSummaryLoading: boolean;
  plan: "flash" | "pro"; remaining: number; prevScreen: Screen; limitHit: boolean;
  errorMsg: string;
  sessionId: string; history: SessionRec[]; histView: boolean;
  limits: ClientLimits; locale: OutputLocale;
}
const MIN_Q = 3;
// 아키네이터 로딩 문구. 추론이 길어질 때 4초 간격으로 다음 문구로 바꿔 진행감을 준다(마지막 문구에서 정지).
const THINK_KEYS = ["thinking", "thinking2", "thinking3", "thinking4"] as const;
const HIGHRISK = /(의료|진단|병원|처방|법률|소송|변호|판결|고소|세무신고|증상|치료)/;
const LOCALE_TAG: Record<OutputLocale, string> = { ko: "ko-KR", en: "en-US", ja: "ja-JP", zh: "zh-CN" };

// pro 여부를 localStorage에 저장해 화면 전환과 새로고침에도 유지한다. reset이 initial을 다시 부르므로 여기서 복원하면 goHome 후에도 pro가 남는다.
function savedPlan(): "flash" | "pro" {
  try { return localStorage.getItem("sidetab:plan") === "pro" ? "pro" : "flash"; } catch { return "flash"; }
}
function initial(): State {
  const plan = savedPlan();
  return {
    screen: "entry", input: "", cond: "", showCond: false, inputErr: false,
    attachedFile: null, dragging: false, attachNote: "",
    chipSeed: 0, tutorialOpen: false,
    classifyOut: null, questions: [], answers: [], sel: [], confidence: 0, pending: false, customText: "", customOpen: false,
    usedUndo: false, tooHard: false, simplify: false,
    terms: [], visibleCount: 0, openId: null, opening: null, query: "", groupView: false, detailCount: 0,
    moreLoading: false, moreLoaded: false, streaming: false, groupGenLoading: "", refining: false,
    ctxInput: "", copied: false, copyFailed: false, shareNote: false, aiSummary: "", aiSummaryLoading: false,
    plan, remaining: plan === "pro" ? 99 : 5, prevScreen: "entry", limitHit: false, errorMsg: "",
    sessionId: "", history: [], histView: false, limits: DEFAULT_CLIENT_LIMITS, locale: "ko",
  };
}

type Action =
  | { type: "merge"; patch: Partial<State> }
  | { type: "addTerm"; term: UITerm }
  | { type: "updateTerm"; id: string; patch: Partial<UITerm> }
  | { type: "reset" };
function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "merge": return { ...s, ...a.patch };
    case "addTerm": return { ...s, terms: [...s.terms, a.term], visibleCount: s.visibleCount + 1 };
    case "updateTerm": return { ...s, terms: s.terms.map((t) => (t.id === a.id ? { ...t, ...a.patch } : t)) };
    case "reset": return initial();
  }
}

// ---------- 표시 헬퍼 ----------
// 문장 단위 줄바꿈. 끊는 지점은 세 가지다. 개행 문자, 전각 종결부호(。！？) 바로 뒤,
// 그리고 반각 종결부호(.!?) 뒤에 공백이 오는 자리. 소수점이나 약어처럼 종결부호 뒤가
// 공백이 아니면 끊지 않는다. 끊은 문장 사이에 <br/>를 넣는다.
function sentLines(t: string): ReactNode[] {
  const segs = String(t ?? "")
    .split(/\n+|(?<=[。！？])|(?<=[.!?])(?=\s)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const out: ReactNode[] = [];
  segs.forEach((s, i) => {
    if (i > 0) out.push(<br key={"br" + i} />);
    out.push(s);
  });
  return out;
}
// 문장 배열로 쪼갠다. sentLines와 같은 분할 규칙(개행, 전각 종결부호, 반각 종결부호+공백).
// 활용 단계 리스트와 개념 핵심/나머지 분리에 쓴다.
function splitSentences(t: string): string[] {
  return String(t ?? "")
    .split(/\n+|(?<=[。！？])|(?<=[.!?])(?=\s)/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}
// 첫 문장만 남긴다. 추천 이유처럼 한 문장만 보여줄 때 두 번째 문장 이후를 잘라 깔끔하게 한다.
function firstSentence(t: string): string {
  const m = t.match(/[\s\S]*?[.!?](?=\s|$)/);
  return (m ? m[0] : t).trim();
}
// 이전 탐색 항목의 날짜 표기(로케일에 맞춰).
function fmtDate(ms: number, locale: OutputLocale): string {
  return new Date(ms).toLocaleDateString(LOCALE_TAG[locale], { month: "short", day: "numeric" });
}
// 텍스트 파일만 허용(타입 또는 확장자). 바이너리(PDF·이미지 등)는 거부한다.
function isTextFile(f: File): boolean {
  if (f.type && (f.type.startsWith("text/") || f.type === "application/json" || f.type === "application/xml")) return true;
  return /\.(txt|md|markdown|csv|json|ya?ml|xml|html?|css|js|ts|tsx|jsx|py|java|c|cpp|cs|go|rs|rb|php|sh|sql|log|tex)$/i.test(f.name);
}
function readTextFile(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ""));
    r.onerror = () => reject(r.error);
    r.readAsText(f);
  });
}

// SVG 아이콘(panel.html과 동일).
const Spark = () => (<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.7 5.1a3 3 0 0 0 1.9 1.9L21 11l-5.4 1.8a3 3 0 0 0-1.9 1.9L12 21l-1.7-5.3a3 3 0 0 0-1.9-1.9L3 11l5.4-1.8a3 3 0 0 0 1.9-1.9z" /></svg>);
const Chev = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 9l6 6 6-6" /></svg>);
const SearchIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>);
const LinkIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17L17 7M9 7h8v8" /></svg>);
const RefreshIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 11a8 8 0 1 0-.9 4.5" /><path d="M20 4v6h-6" /></svg>);
const LockIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>);
const TrashIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3M10 11v6M14 11v6" /></svg>);
const BookmarkIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 4h12a1 1 0 0 1 1 1v15l-7-4.5L5 20V5a1 1 0 0 1 1-1z" /></svg>);
const UserIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4" /><path d="M5 20a7 7 0 0 1 14 0" /></svg>);
const CopyIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></svg>);
const ShareIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>);
const InfoIcon = () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 11v5" /><path d="M12 8h.01" /></svg>);

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initial);
  const sref = useRef(state); sref.current = state;
  const abortRef = useRef<AbortController | null>(null);
  const merge = useCallback((patch: Partial<State>) => dispatch({ type: "merge", patch }), []);
  const later = (fn: () => void, ms: number) => window.setTimeout(fn, ms);

  // ----- 진입 -----
  const go = (screen: Screen) => merge({ screen });
  const goHome = () => dispatch({ type: "reset" });
  // 이전 탐색 항목 삭제: 저장소에서 지우고 남은 목록으로 갱신.
  const deleteHistory = (id: string) => { void deleteSession(id).then((list) => merge({ history: list })); };

  const startNarrow = useCallback(async (raw: string) => {
    merge({ pending: true, screen: "narrow", answers: [], sel: [], questions: [], input: raw, refining: false, usedUndo: false, tooHard: false, simplify: false });
    try {
      const p1 = await api.classify({ raw_input: raw, ...(sref.current.attachedFile ? { context_object: sref.current.attachedFile.text } : {}) });
      if (p1.domain_risk === "high") { merge({ pending: false, screen: "refusal" }); return; }
      // 분류 결과가 비정상(질문/선택지 형태가 깨짐)이면 좁히기를 건너뛰고 바로 추천으로. 렌더 중 throw로 인한 블랭크 크래시 방지.
      if (typeof p1.question !== "string" || !Array.isArray(p1.choices) || p1.choices.length === 0) {
        merge({ pending: false, classifyOut: p1 }); void runRecommend(); return;
      }
      merge({ pending: false, classifyOut: p1, questions: [{ question: p1.question, choices: p1.choices }] });
    } catch (e) {
      merge({ pending: false, screen: "terms", errorMsg: msg(e), streaming: false });
    }
  }, [merge]);

  const submitEntry = () => {
    const v = sref.current.input.trim();
    if (!v) { merge({ inputErr: true }); later(() => merge({ inputErr: false }), 2400); return; }
    if (HIGHRISK.test(v)) { go("refusal"); return; }
    void startNarrow(v);
  };
  const chip = (t: string) => { if (HIGHRISK.test(t)) { merge({ input: t, screen: "refusal" }); return; } void startNarrow(t); };

  // ----- 파일 첨부(pro 전용, 붙여넣은 문서 = context_object) -----
  // 텍스트 파일을 읽어 context_object로 담는다. 길면 maxContextChars로 잘라 보낸다(노트로 알림).
  const acceptFile = useCallback(async (file: File) => {
    if (!isTextFile(file)) { merge({ attachNote: "attach_texterr", dragging: false }); later(() => merge({ attachNote: "" }), 3000); return; }
    try {
      let text = (await readTextFile(file)).trim();
      const max = sref.current.limits.maxContextChars;
      const truncated = text.length > max;
      if (truncated) text = text.slice(0, max);
      merge({ attachedFile: { name: file.name, text }, attachNote: truncated ? "attach_truncated" : "", dragging: false });
      if (truncated) later(() => merge({ attachNote: "" }), 3500);
    } catch { merge({ attachNote: "attach_texterr", dragging: false }); later(() => merge({ attachNote: "" }), 3000); }
  }, [merge]);
  const removeAttached = () => merge({ attachedFile: null, attachNote: "" });
  // 무료가 파일을 드롭하면 pro 안내(페이월)로 보낸다.
  const attachPaywall = () => merge({ prevScreen: "entry", screen: "paywall", limitHit: false, dragging: false });

  // ----- 좁히기 -----
  const toggleSel = (o: string) => {
    const sel = sref.current.sel;
    const next = sel.includes(o) ? sel.filter((x) => x !== o) : [...sel, o];
    merge({ sel: next, tooHard: false }); // 일반 선택을 누르면 "어려워요" 배타 선택은 해제
  };
  // 좁히기 한 턴 진행: 누적 답변으로 nextBranch를 호출해 다음 질문을 받거나, 충분하면 추천으로 넘긴다. nextStep과 조건 재탐색이 공유한다.
  // simplify는 sticky(세션 유지)지만 막 설정한 직후엔 sref가 stale일 수 있어 opts로 명시 전달한다.
  const advanceNarrow = useCallback(async (answers: string[][], opts?: { simplify?: boolean }) => {
    const s0 = sref.current;
    const history = answers.flat().map((label) => ({ label, action: "선택" as const }));
    const simplify = opts?.simplify ?? s0.simplify;
    try {
      const p2 = await api.nextBranch({ domain: s0.classifyOut?.domain ?? "", job_type: s0.classifyOut?.job_type ?? [], history, ...(s0.attachedFile ? { context_object: s0.attachedFile.text } : {}), ...(simplify ? { simplify: true } : {}) });
      const s = sref.current;
      // 좁히기 최대 턴은 워커 한도(limits.narrowMax)에서 온다. free는 적게, paid는 의중이 갈릴 때만 더.
      const maxQ = s.plan === "pro" ? s.limits.narrowMax.paid : s.limits.narrowMax.free;
      const conf = Number.isFinite(p2.confidence) ? p2.confidence : s.confidence;
      const enough = (answers.length >= MIN_Q && p2.enough) || answers.length >= maxQ;
      // 다음 질문이 비정상이면(off-topic 등으로 형태가 깨짐) 좁히기를 종료하고 추천으로. 렌더 중 throw로 인한 블랭크 크래시 방지.
      const badNext = typeof p2.question !== "string" || !Array.isArray(p2.choices) || p2.choices.length === 0;
      if (enough || badNext) { merge({ pending: false, confidence: conf }); void runRecommend(sref.current.refining); return; }
      merge({ pending: false, confidence: conf, questions: [...s.questions, { question: p2.question, choices: p2.choices }] });
    } catch (e) {
      merge({ pending: false, screen: "terms", errorMsg: msg(e) });
    }
  }, [merge]);
  const nextStep = useCallback(async () => {
    const s = sref.current;
    // "선택지가 어려워요"를 고른 턴: 마커 한 칸을 답변으로 넣고 이후 난이도를 낮춘다(simplify sticky).
    if (s.tooHard) {
      const answers = [...s.answers, [tr(s.locale, "narrow_hard")]];
      merge({ answers, sel: [], customText: "", customOpen: false, tooHard: false, simplify: true, pending: true });
      await advanceNarrow(answers, { simplify: true });
      return;
    }
    const custom = s.customText.trim();
    const picked = custom ? [...s.sel, custom] : s.sel; // 칩 + 직접 입력 합산(둘 다 포함)
    if (picked.length === 0) return;
    const answers = [...s.answers, picked];
    merge({ answers, sel: [], customText: "", customOpen: false, pending: true });
    await advanceNarrow(answers);
  }, [merge, advanceNarrow]);
  // Terms에서 조건을 입력해 아키네이터로 재진입(다음 질문부터). pro 전용, 무료는 페이월. narrowMax 동일 적용.
  const refineFromTerms = useCallback(async (text: string) => {
    const s = sref.current;
    const t = text.trim();
    if (!t) return;
    if (s.plan !== "pro") { merge({ prevScreen: "terms", screen: "paywall", limitHit: false }); return; }
    // 재탐색 조건은 새 턴이 아니라 직전 답변에 덧붙인다. 새 그룹으로 넣으면 턴 수가 한 칸 부풀어
    // 다음 질문이 4턴이 아니라 5턴으로 밀린다(진행바도 같이 밀림). 덧붙이면 nextBranch 히스토리는 동일하다.
    const answers = s.answers.length
      ? s.answers.map((g, i) => (i === s.answers.length - 1 ? [...g, t] : g))
      : [[t]];
    merge({ answers, sel: [], customText: "", customOpen: false, query: "", screen: "narrow", pending: true, refining: true });
    await advanceNarrow(answers);
  }, [merge, advanceNarrow]);
  // 되돌리기는 세션당 1회. 누르면 곧장 1턴(첫 질문)으로 회귀하고 버튼은 비활성된다.
  const undoStep = () => {
    const s = sref.current;
    if (s.usedUndo || s.answers.length === 0) return;
    merge({ answers: [], questions: s.questions.slice(0, 1), sel: [], customText: "", customOpen: false, tooHard: false, confidence: 0, usedUndo: true });
  };
  const jumpToTerms = () => void runRecommend();

  // ----- 추천(스트리밍) -----
  const buildRecInput = (exclude?: string[]): RecommendInput => {
    const s = sref.current; const c = s.classifyOut;
    return {
      area: c?.domain ?? "", domain: c?.domain ?? "other", topic: s.input,
      locale: c?.search_locale ?? "en", job_type: c?.job_type ?? [], domain_risk: c?.domain_risk ?? "low",
      ...(exclude && exclude.length ? { exclude } : {}),
      ...(s.attachedFile ? { context_object: s.attachedFile.text } : {}),
    };
  };
  const runRecommend = useCallback(async (append = false) => {
    const s = sref.current;
    const tier = s.plan === "pro" ? "paid" : "free";
    if (!append && s.remaining <= 0) { merge({ prevScreen: s.screen, screen: "paywall", limitHit: true }); return; }
    abortRef.current?.abort();
    const ctrl = new AbortController(); abortRef.current = ctrl;
    if (append) {
      // 조건 재탐색: 기존 리스트를 비우지 않고 이어서 추가한다(기존 어휘 제외, 누적 상한까지).
      const cap = s.limits.maxTotal[tier];
      merge({ screen: "terms", streaming: true, errorMsg: "", moreLoaded: false, query: "", refining: false });
      const exclude = s.terms.map((t) => t.term);
      await api.streamRecommend(buildRecInput(exclude), tier, (ev) => {
        if (ev.type === "term") {
          if (sref.current.terms.length >= cap) { ctrl.abort(); return; }
          const n = sref.current.terms.length; const id = "r" + n;
          dispatch({ type: "addTerm", term: { ...ev.term, priority: n + 1, id, kept: false, _new: true } });
          later(() => dispatch({ type: "updateTerm", id, patch: { _new: false } }), 780);
        } else if (ev.type === "done") merge({ streaming: false });
        else if (ev.type === "error") merge({ streaming: false, errorMsg: ev.message, ...(ev.code === "HIGH_RISK_REFUSED" ? { screen: "refusal" } : {}) });
      }, ctrl.signal).catch((e) => { if ((e as Error).name !== "AbortError") merge({ streaming: false, errorMsg: msg(e) }); });
      return;
    }
    merge({ screen: "terms", terms: [], visibleCount: 0, openId: null, streaming: true, errorMsg: "", moreLoaded: false, query: "", remaining: Math.max(0, s.remaining - 1), sessionId: crypto.randomUUID(), histView: false, detailCount: 0, refining: false });
    await api.streamRecommend(buildRecInput(), tier, (ev) => {
      if (ev.type === "term") {
        const id = "t" + sref.current.terms.length;
        dispatch({ type: "addTerm", term: { ...ev.term, id, kept: false, _new: true } });
        later(() => dispatch({ type: "updateTerm", id, patch: { _new: false } }), 780);
      } else if (ev.type === "done") merge({ streaming: false });
      else if (ev.type === "error") merge({ streaming: false, errorMsg: ev.message, ...(ev.code === "HIGH_RISK_REFUSED" ? { screen: "refusal" } : {}) });
    }, ctrl.signal).catch((e) => { if ((e as Error).name !== "AbortError") merge({ streaming: false, errorMsg: msg(e) }); });
  }, [merge]);

  const loadMore = useCallback(async () => {
    const s = sref.current;
    if (s.moreLoaded || s.moreLoading) return;
    // 더 보기는 유료 전용. 무료는 페이월로 보낸다(추가 추천 호출 절감).
    if (s.plan !== "pro") { merge({ prevScreen: "terms", screen: "paywall", limitHit: false }); return; }
    if (s.terms.length >= s.limits.maxTotal.paid) { merge({ moreLoaded: true }); return; } // 누적 상한(maxTotal) 도달
    merge({ moreLoading: true });
    const exclude = s.terms.map((t) => t.term);
    let got = 0;
    const ctrl = new AbortController();
    await api.streamRecommend(buildRecInput(exclude), s.plan === "pro" ? "paid" : "free", (ev) => {
      if (ev.type === "term") {
        // 카드 번호는 기존 개수에 이어서 매긴다(더보기 시 1부터 재시작 버그 수정).
        got++; const n = sref.current.terms.length; const id = "m" + n;
        dispatch({ type: "addTerm", term: { ...ev.term, priority: n + 1, id, kept: false, _new: true } });
        later(() => dispatch({ type: "updateTerm", id, patch: { _new: false } }), 780);
      }
    }, ctrl.signal).catch(() => {});
    merge({ moreLoading: false, moreLoaded: got === 0 });
  }, [merge]);

  // 그룹 보기에서 해당 그룹 어휘만 추가 생성한다(무료 2·유료 4 고정). maxTotal 누적 상한을 적용한다.
  const genGroup = useCallback(async (group: string) => {
    const s = sref.current;
    if (s.groupGenLoading) return;
    const tier: "free" | "paid" = s.plan === "pro" ? "paid" : "free";
    if (s.terms.length >= s.limits.maxTotal[tier]) { merge({ prevScreen: "terms", screen: "paywall", limitHit: true }); return; }
    merge({ groupGenLoading: group });
    const want = s.limits.groupGen[tier];
    const exclude = s.terms.map((t) => t.term);
    let got = 0;
    const ctrl = new AbortController();
    await api.streamRecommend({ ...buildRecInput(exclude), user_condition: `Only suggest vocabulary that belongs to the group "${group}".` }, tier, (ev) => {
      if (ev.type === "term" && got < want) {
        got++; const n = sref.current.terms.length; const id = "g" + n;
        dispatch({ type: "addTerm", term: { ...ev.term, group, priority: n + 1, id, kept: false, _new: true } });
        later(() => dispatch({ type: "updateTerm", id, patch: { _new: false } }), 780);
        if (got >= want) ctrl.abort();
      }
    }, ctrl.signal).catch(() => {});
    merge({ groupGenLoading: "" });
  }, [merge]);

  // ----- Keep(담기)/상세 -----
  // 현재 세션의 담은 어휘를 chrome.storage.local에 upsert하고 history 상태를 갱신한다.
  const persist = useCallback(async (terms: UITerm[]) => {
    const s = sref.current;
    const id = s.sessionId || s.input;
    const keptTerms: KeptTerm[] = terms.filter((t) => t.kept).map((t) => ({
      term: t.term, kind: t.kind, one_line: t.one_line, why: t.why, priority: t.priority,
      ...(t.group ? { group: t.group } : {}), ...(t.detail ? { detail: t.detail } : {}),
    }));
    const existing = s.history.find((h) => h.id === id);
    const rec: SessionRec = {
      id, topic: s.input, area: s.classifyOut?.domain ?? "",
      locale: s.classifyOut?.search_locale ?? "en",
      createdAt: existing?.createdAt ?? Date.now(), terms: keptTerms,
    };
    const list = await saveSession(rec);
    merge({ history: list });
  }, [merge]);
  const toggleKeep = (id: string) => {
    const cur = sref.current.terms;
    const t = cur.find((x) => x.id === id); if (!t) return;
    const next = cur.map((x) => (x.id === id ? { ...x, kept: !x.kept } : x));
    dispatch({ type: "updateTerm", id, patch: { kept: !t.kept } });
    void persist(next);
  };
  const toggleDetail = useCallback(async (id: string) => {
    const s = sref.current;
    if (s.openId === id) { merge({ openId: null }); return; }
    const t = s.terms.find((x) => x.id === id);
    const willFetch = !!t && !t.detail && !t.detailLoading; // 캐시 없으면 새로 불러온다
    // 무료 상세 열람은 세션당 limits.detailLimitFree회. 새로 불러오는 경우만 세고, 한도를 넘으면 페이월(캐시 재열람은 무제한).
    if (willFetch && s.plan !== "pro" && s.detailCount >= s.limits.detailLimitFree) {
      merge({ prevScreen: s.screen, screen: "paywall", limitHit: false });
      return;
    }
    merge({ openId: id, opening: id });
    later(() => { if (sref.current.opening === id) merge({ opening: null }); }, 340);
    if (t && willFetch) {
      dispatch({ type: "updateTerm", id, patch: { detailLoading: true } });
      if (s.plan !== "pro") merge({ detailCount: s.detailCount + 1 });
      try {
        const d = await api.detail({ term: t.term, kind: t.kind, area: s.classifyOut?.domain ?? "", job_type: s.classifyOut?.job_type ?? [], domain: s.classifyOut?.domain ?? "other", topic: s.input, locale: s.classifyOut?.search_locale ?? "en" }, s.plan === "pro" ? "paid" : "free");
        dispatch({ type: "updateTerm", id, patch: { detail: d, detailLoading: false } });
        const withDetail = sref.current.terms.map((x) => (x.id === id ? { ...x, detail: d } : x));
        if (withDetail.find((x) => x.id === id)?.kept) void persist(withDetail);
      } catch { dispatch({ type: "updateTerm", id, patch: { detailLoading: false } }); }
    }
  }, [merge]);
  const jumpRelated = (name: string) => { const t = sref.current.terms.find((x) => x.term === name); if (t) void toggleDetail(t.id); };
  // ----- 요약(출력 언어로) -----
  const buildSummary = (s: State): string => {
    const loc = s.locale;
    const names = s.terms.filter((t) => t.kept).map((t) => t.term);
    const cond = (s.cond || "").trim(); const ctxObj = s.input.trim();
    const area = s.classifyOut?.domain ?? "";
    const L = [tr(loc, "sum_intro", { area: area || "—" })];
    if (cond) L.push(tr(loc, "sum_cond", { cond }));
    if (names.length) L.push(tr(loc, "sum_terms", { names: names.join("·") }));
    else L.push(tr(loc, "sum_terms_empty"));
    if (ctxObj) L.push(tr(loc, "sum_ctx", { ctx: ctxObj }));
    L.push(""); L.push(tr(loc, "sum_ask"));
    L.push(tr(loc, "sum_footer"));
    return L.join("\n");
  };
  const onCopy = () => {
    const txt = buildSummary(sref.current);
    navigator.clipboard?.writeText(txt).then(
      () => { merge({ copied: true, copyFailed: false }); later(() => merge({ copied: false }), 1800); },
      () => { merge({ copyFailed: true, copied: false }); later(() => merge({ copyFailed: false }), 2600); },
    );
  };
  const onShare = () => {
    const txt = buildSummary(sref.current);
    if (navigator.share) { void navigator.share({ text: txt }).catch(() => {}); return; }
    navigator.clipboard?.writeText(txt).finally(() => { merge({ shareNote: true }); later(() => merge({ shareNote: false }), 1800); });
  };
  const aiRefine = useCallback(async () => {
    const s = sref.current;
    if (s.plan !== "pro") { merge({ prevScreen: "kept", screen: "paywall", limitHit: false }); return; }
    merge({ aiSummaryLoading: true });
    // Keep 전환 후 태그가 무의미해져 계약 유지용으로 전부 "몰라" 고정 전송(인터페이스계약 §1·§5 summary 보류).
    const vocab = s.terms.filter((t) => t.kept).map((t) => ({ term: t.term, tag: "몰라" as Tag }));
    try {
      const r = await api.summarize({ area: s.classifyOut?.domain ?? "", job_type: s.classifyOut?.job_type ?? [], vocab, ...(s.ctxInput ? { user_condition: s.ctxInput } : {}) }, "paid");
      merge({ aiSummary: r.paste_text, aiSummaryLoading: false });
    } catch (e) { merge({ aiSummaryLoading: false, errorMsg: msg(e) }); }
  }, [merge]);

  // ----- 히스토리(이전 탐색) -----
  const openHistory = (rec: SessionRec) => {
    const terms: UITerm[] = rec.terms.map((k, i) => ({
      term: k.term, kind: k.kind, priority: k.priority, why: k.why, one_line: k.one_line, tag: "몰라",
      ...(k.group ? { group: k.group } : {}),
      id: "h" + i, kept: true, _new: false, ...(k.detail ? { detail: k.detail } : {}),
    }));
    merge({
      screen: "kept", histView: true, terms, visibleCount: terms.length, openId: null,
      sessionId: rec.id, input: rec.topic, ctxInput: "", aiSummary: "",
      classifyOut: { domain: rec.area, job_type: [], condition_required: false, question: "", choices: [], search_locale: rec.locale === "ko" ? "ko" : "en", domain_risk: "low" },
    });
  };

  const openPaywall = () => merge({ prevScreen: sref.current.screen, screen: "paywall", limitHit: false });
  const closePaywall = () => merge({ screen: sref.current.prevScreen === "paywall" ? "entry" : sref.current.prevScreen });
  const onUpgrade = () => { merge({ plan: "pro", remaining: 99 }); try { localStorage.setItem("sidetab:plan", "pro"); } catch { /* 무시 */ } later(closePaywall, 350); };
  // 언어 변경: api 헤더·로컬 저장·상태를 함께 갱신한다(재빌드 없이 즉시 반영).
  const changeLocale = (l: OutputLocale) => {
    api.setLocale(l);
    try { localStorage.setItem("sidetab:locale", l); } catch { /* 무시 */ }
    merge({ locale: l });
  };
  // 튜토리얼 닫기: 닫고 '봤음'을 기억한다(이후 자동으로 안 뜸, 헤더 ?로만 재열람).
  const closeTutorial = () => {
    merge({ tutorialOpen: false });
    try { localStorage.setItem("sidetab:tutorial-seen", "true"); } catch { /* 무시 */ }
  };

  useEffect(() => () => abortRef.current?.abort(), []);
  // 진입 화면에 들어설 때마다 저장된 이전 탐색을 다시 읽어 리스트를 채운다(reset 후에도 갱신).
  useEffect(() => { if (state.screen === "entry") void loadSessions().then((list) => merge({ history: list })); }, [state.screen, merge]);
  // 워커 운영 한도(좁히기 턴·상세 횟수 등)를 한 번 읽어 게이팅에 쓴다. 실패 시 기본값 유지.
  useEffect(() => { void api.getConfig().then((l) => merge({ limits: l })); }, [merge]);
  // 출력/UI 언어: 저장된 선택을 우선, 없으면 브라우저/OS 감지. api와 상태에 반영.
  useEffect(() => {
    let l = api.detectLocale();
    try { const st = localStorage.getItem("sidetab:locale"); if (st && (["ko", "en", "ja", "zh"] as string[]).includes(st)) l = st as OutputLocale; } catch { /* 무시 */ }
    api.setLocale(l); merge({ locale: l });
  }, [merge]);
  // 첫 방문이면 튜토리얼 팝업을 자동으로 띄운다(localStorage로 1회만).
  useEffect(() => {
    try { if (localStorage.getItem("sidetab:tutorial-seen") !== "true") merge({ tutorialOpen: true }); } catch { /* 무시 */ }
  }, [merge]);

  const live = state.screen === "narrow";
  return (
    <div id="app" className={live ? "live" : ""} role="application" aria-label="Vock note">
      {state.pending && <div className="bar" role="status"><i /></div>}
      <Header state={state} openPaywall={openPaywall} goHome={goHome} changeLocale={changeLocale} openTutorial={() => merge({ tutorialOpen: true })} />
      {state.screen === "entry" && <Entry state={state} merge={merge} submitEntry={submitEntry} chip={chip} openHistory={openHistory} deleteHistory={deleteHistory} acceptFile={acceptFile} attachPaywall={attachPaywall} removeAttached={removeAttached} />}
      {state.screen === "narrow" && <Narrow state={state} merge={merge} toggleSel={toggleSel} nextStep={nextStep} undoStep={undoStep} jumpToTerms={jumpToTerms} />}
      {state.screen === "terms" && <Terms state={state} merge={merge} loadMore={loadMore} toggleKeep={toggleKeep} toggleDetail={toggleDetail} jumpRelated={jumpRelated} go={go} refine={refineFromTerms} genGroup={genGroup} />}
      {state.screen === "kept" && <Kept state={state} merge={merge} go={go} goHome={goHome} toggleKeep={toggleKeep} toggleDetail={toggleDetail} jumpRelated={jumpRelated} buildSummary={buildSummary} onCopy={onCopy} onShare={onShare} aiRefine={aiRefine} />}
      {state.screen === "paywall" && <Paywall state={state} closePaywall={closePaywall} onUpgrade={onUpgrade} />}
      {state.screen === "refusal" && <Refusal state={state} goHome={goHome} />}
      {state.tutorialOpen && <Tutorial state={state} onClose={closeTutorial} />}
    </div>
  );
}

function msg(e: unknown): string { return e instanceof Error ? e.message : String(e); }

// ---------- 화면 컴포넌트 ----------
function Header({ state, openPaywall, goHome, changeLocale, openTutorial }: { state: State; openPaywall: () => void; goHome: () => void; changeLocale: (l: OutputLocale) => void; openTutorial: () => void }) {
  const warn = state.plan !== "pro" && state.remaining <= 2;
  const brandName = state.locale === "ko" ? "배경노트" : "Vock note";
  const brandSub = state.locale === "ko" ? "Vock note" : "Voca·back·note";
  return (
    <header>
      <button className="brand" onClick={goHome}>
        <span className="logo"><img src="icons/icon-32.png" alt="" width={24} height={24} /></span>
        <span><b>{brandName}</b><span>{brandSub}</span></span>
      </button>
      <div className="htools">
        {/* 언어 설정과 도움말은 진입(메인) 화면에서만. 이미 생성된 LLM 텍스트는 언어 변경에 반응하지 않아, 탐색 중 전환을 막는다. */}
        {state.screen === "entry" && <>
          <button className="help" onClick={openTutorial} aria-label={tr(state.locale, "help")} title={tr(state.locale, "help")}>?</button>
          <select className="langsel" aria-label={tr(state.locale, "lang_label")} value={state.locale} onChange={(e) => changeLocale(e.target.value as OutputLocale)}>
            {(Object.keys(LOCALE_LABELS) as OutputLocale[]).map((l) => <option key={l} value={l}>{LOCALE_LABELS[l]}</option>)}
          </select>
        </>}
        <button className={`plan ${state.plan === "pro" ? "ispro" : ""} ${warn ? "warn" : ""}`} onClick={openPaywall}>
          {state.plan === "pro" ? <><b>pro</b><span>{tr(state.locale, "plan_unlimited")}</span></> : <><b>flash</b><span>{tr(state.locale, "plan_free_left", { n: state.remaining })}</span></>}
        </button>
      </div>
    </header>
  );
}

function Entry({ state, merge, submitEntry, chip, openHistory, deleteHistory, acceptFile, attachPaywall, removeAttached }: { state: State; merge: (p: Partial<State>) => void; submitEntry: () => void; chip: (t: string) => void; openHistory: (rec: SessionRec) => void; deleteHistory: (id: string) => void; acceptFile: (f: File) => void; attachPaywall: () => void; removeAttached: () => void }) {
  const loc = state.locale;
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const grow = () => { const el = taRef.current; if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 160) + "px"; } };
  useEffect(grow, []);
  // 예시 칩: ~50개 풀에서 랜덤 5개. loc/chipSeed가 바뀔 때만 재추첨(타이핑 중엔 고정, 홈 복귀·새로고침 시 새로).
  const picks = useMemo(() => pickRandom(EXAMPLES[loc] ?? EXAMPLES.ko, 5), [loc, state.chipSeed]);
  // 드롭: 무료는 pro 안내(페이월), pro는 파일을 읽어 첨부.
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); merge({ dragging: false });
    const f = e.dataTransfer.files?.[0]; if (!f) return;
    if (state.plan !== "pro") { attachPaywall(); return; }
    acceptFile(f);
  };
  const FILE_ACCEPT = "text/*,.txt,.md,.markdown,.csv,.json,.yml,.yaml,.xml,.html,.log,.tex";
  return (
    <main className="scroll entryMain">
      <div className="hero">
        <h1 className="heroTitle">{tr(loc, "entry_title")}</h1>
        <p className="heroSub">{sentLines(tr(loc, state.plan === "pro" ? "entry_sub_pro" : "entry_sub"))}</p>
        <div className="heroGlow">
        <div className="aurora" aria-hidden="true" />
        <div className={`composer ${state.inputErr ? "err" : ""}${state.dragging ? " dragging" : ""}`}
          onDragOver={(e) => { e.preventDefault(); if (!state.dragging) merge({ dragging: true }); }}
          onDragLeave={(e) => { e.preventDefault(); merge({ dragging: false }); }}
          onDrop={onDrop}>
          <textarea ref={taRef} className="composerInput" rows={1} aria-label={tr(loc, "entry_input_aria")}
            placeholder={tr(loc, "entry_input_ph")} value={state.input}
            onChange={(e) => { merge({ input: e.target.value }); grow(); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitEntry(); } }} />
          <div className="composerBar">
            {state.plan === "pro" && <>
              <input ref={fileRef} type="file" accept={FILE_ACCEPT} style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) acceptFile(f); e.target.value = ""; }} />
              <button className="attach" onClick={() => fileRef.current?.click()} aria-label={tr(loc, "attach")} title={tr(loc, "attach")}>{tr(loc, "attach_short")}</button>
            </>}
            <button className="condToggle" onClick={() => merge({ showCond: !state.showCond })}>{state.showCond ? tr(loc, "cond_close") : tr(loc, "cond_add")}</button>
            <button className="send" onClick={submitEntry} aria-label={tr(loc, "next")}>→</button>
          </div>
        </div>
        {state.attachedFile && <div className="filechip"><span className="fn">📄 {state.attachedFile.name}</span><button onClick={removeAttached} aria-label={tr(loc, "attach_remove")}>×</button></div>}
        {state.attachNote && <div className="errmsg" style={{ textAlign: "center" }}>{tr(loc, state.attachNote)}</div>}
        {state.inputErr && <div className="errmsg" style={{ textAlign: "center" }}>{tr(loc, "entry_err")}</div>}
        {state.showCond && <input className="field condField" aria-label={tr(loc, "cond_aria")} placeholder={tr(loc, "cond_ph")} value={state.cond} onChange={(e) => merge({ cond: e.target.value })} />}
        <div className="suggest">
          {picks.map((c, i) => <button key={c} className="sg" style={{ animationDelay: `${(i % 5) * 0.8}s` }} onClick={() => chip(c)}>{c}</button>)}
          <button className="shuffle" onClick={() => merge({ chipSeed: state.chipSeed + 1 })} aria-label={tr(loc, "shuffle")} title={tr(loc, "shuffle")}><RefreshIcon /></button>
        </div>
        </div>
        {state.history.length > 0 && (
          <div className="history">
            <div className="histhead">{tr(loc, "history_head")}</div>
            {state.history.slice(0, 8).map((h) => (
              <div key={h.id} className="histitem">
                <button className="histmain" onClick={() => openHistory(h)}>
                  <span className="histtopic">{h.topic || tr(loc, "history_untitled")}</span>
                  <span className="histmeta">{tr(loc, "history_meta", { n: h.terms.length, date: fmtDate(h.createdAt, loc) })}</span>
                </button>
                <button className="histdel" onClick={() => deleteHistory(h.id)} aria-label={tr(loc, "history_delete")} title={tr(loc, "history_delete")}><TrashIcon /></button>
              </div>
            ))}
          </div>
        )}
      </div>
      <p className="note entryNote">{tr(loc, "entry_note")}</p>
    </main>
  );
}

function Narrow({ state, merge, toggleSel, nextStep, undoStep, jumpToTerms }: { state: State; merge: (p: Partial<State>) => void; toggleSel: (o: string) => void; nextStep: () => void; undoStep: () => void; jumpToTerms: () => void }) {
  const loc = state.locale;
  const customRef = useRef<HTMLTextAreaElement>(null);
  // 로딩 중일 때 4초 간격으로 문구 인덱스를 올린다(마지막에서 멈춤). pending이 끝나거나 화면을 떠나면 정리한다.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!state.pending) { setTick(0); return; }
    setTick(0);
    const id = window.setInterval(() => setTick((n) => (n < THINK_KEYS.length - 1 ? n + 1 : n)), 4000);
    return () => window.clearInterval(id);
  }, [state.pending]);
  // 입력 길이에 따라 높이가 늘어나는 적응형 입력(최대 140px 후 내부 스크롤).
  const growCustom = () => { const el = customRef.current; if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 140) + "px"; } };
  if (state.pending) {
    return (<main className="scroll entryMain"><div className="thinking">
      <div className="aiav"><Spark /></div>
      <div className="msg">{sentLines(tr(loc, THINK_KEYS[tick]))}</div>
      <div className="dots3"><i /><i /><i /></div>
    </div></main>);
  }
  const idx = state.answers.length;
  const cur = state.questions[idx] ?? state.questions[state.questions.length - 1];
  // 기본 진행바는 턴 수로만 채운다(confidence 무관). 한 칸 당겨 3번째 질문(idx 2)에서 100%가 되고, 그 뒤는 pro 연장 트랙이 맡는다.
  const pct = Math.round(Math.min(idx + 1, 3) / 3 * 100);
  // 4번째 질문부터는 pro 전용 심화 구간(무료는 3턴에서 종료되므로 자연히 pro만 도달).
  const proPhase = idx >= 3;
  // 4턴부터 기본 진행바 오른쪽으로 오로라가 연장되는 비율(paid 한도까지 채워짐).
  // 4턴(idx 3)에서 이미 한 칸(약 20%) 차 있고 마지막 턴에서 100%가 되도록 (idx-2)로 한 칸 당긴다.
  const maxPaid = state.limits.narrowMax.paid;
  const extraPct = proPhase ? Math.round(Math.min(1, (idx - 2) / Math.max(1, maxPaid - 3)) * 100) : 0;
  return (
    <main className="scroll"><div className="pad" style={{ display: "flex", flexDirection: "column" }}>
      <div className="aiwrap">
        <span className="aimeta">{tr(loc, "narrow_ai", { n: idx + 1 })}{state.confidence >= 0.75 ? tr(loc, "narrow_almost") : ""}</span>
        {(state.answers.length > 0 || state.usedUndo) && <button className="link" style={{ marginLeft: "auto" }} disabled={state.usedUndo} onClick={undoStep}>{tr(loc, "undo")}</button>}
      </div>
      <div className={`progress${proPhase ? " pro" : ""}`} style={{ marginBottom: 16 }}>
        <div className="track base"><i style={{ width: pct + "%" }} /></div>
        {proPhase && <div className="track extra"><i style={{ width: extraPct + "%" }} /></div>}
        {proPhase
          ? <span className="promark">/{maxPaid}</span>
          : (state.plan !== "pro" && <span className="prolock" title={tr(loc, "prolock_title")}><LockIcon />{tr(loc, "prolock")}</span>)}
      </div>
      <h2>{sentLines(cur?.question ?? "")}</h2>
      <p className="lead" style={{ margin: "6px 0 16px" }}>{tr(loc, "narrow_lead")}</p>
      {(cur?.choices ?? []).map((o) => {
        const on = state.sel.includes(o.label);
        return <button key={o.label} className={`opt ${on ? "sel" : ""}`} onClick={() => toggleSel(o.label)}><span>{o.label}</span><span className="tick">✓</span></button>;
      })}
      {state.customOpen && <>
        <textarea ref={customRef} className="field" rows={1} autoFocus aria-label={tr(loc, "custom_open")} placeholder={tr(loc, "custom_ph")} value={state.customText} style={{ marginTop: 11 }}
          onChange={(e) => { merge({ customText: e.target.value, tooHard: false }); growCustom(); }}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); nextStep(); } }} />
        <p className="subhint">{tr(loc, "custom_hint")}</p>
      </>}
      <div className="subrow">
        <button className={`sublink ${state.customOpen ? "on" : ""}`} onClick={() => merge({ customOpen: !state.customOpen, tooHard: false, ...(state.customOpen ? { customText: "" } : {}) })}>{tr(loc, "custom_open")}</button>
        <button className={`sublink ${state.tooHard ? "on" : ""}`} onClick={() => merge({ tooHard: true, sel: [], customText: "", customOpen: false })}>{tr(loc, "narrow_hard")}</button>
      </div>
      <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={nextStep} disabled={!state.tooHard && state.sel.length === 0 && !state.customText.trim()}>{tr(loc, "next")}</button>
      <p className="note" style={{ marginTop: 12 }}>{tr(loc, "narrow_note")}</p>
      <button className="link" style={{ marginTop: 8, alignSelf: "center" }} onClick={jumpToTerms}>{tr(loc, "narrow_jump")}</button>
    </div></main>
  );
}

function Detail({ t, locale, opening, jumpRelated, toggleKeep }: { t: UITerm; locale: OutputLocale; opening: boolean; jumpRelated: (n: string) => void; toggleKeep: (id: string) => void }) {
  if (t.detailLoading || !t.detail) return <div className="detail"><p className="dtext" style={{ color: "var(--muted)" }}>{tr(locale, "detail_loading")}</p></div>;
  const d = t.detail;
  // 개념은 핵심(첫 문장)을 굵게 두고 나머지를 이어 보여준다(핵심 우선). 활용은 문장을 단계로 쪼갠다.
  const whatSents = splitSentences(d.what);
  const whatLead = whatSents[0] ?? d.what;
  const whatRest = whatSents.slice(1);
  const howSteps = splitSentences(d.how);
  return (
    <div className={`detail${opening ? " animin" : ""}`}>
      <div className="dparts">
        <section className="dpart">
          <div className="dlabel">{tr(locale, "dlabel_what")}</div>
          <div className="dtext"><b className="dlead">{whatLead}</b>{whatRest.map((s, i) => <span key={i}><br />{s}</span>)}</div>
        </section>
        <section className="dpart mine">
          <div className="dlabel">{tr(locale, "dlabel_mine")}</div>
          <div className="dtext">{sentLines(d.whymine)}</div>
          {t.context_note && <div className="dsub"><b>{tr(locale, "detail_ctx")}</b>{sentLines(t.context_note)}</div>}
        </section>
        <section className="dpart">
          <div className="dlabel">{tr(locale, "dlabel_how")}</div>
          <ul className="dsteps">{howSteps.map((s, i) => <li key={i}>{s}</li>)}</ul>
          {t.direction && <div className="dsub"><b>{tr(locale, "detail_dir")}</b>{sentLines(t.direction)}</div>}
          {t.use_example && <div className="dsub"><b>{tr(locale, "detail_ex")}</b>{sentLines(t.use_example)}</div>}
        </section>
        {d.misc && <p className="dmemo"><InfoIcon />{sentLines(d.misc)}</p>}
      </div>
      <div className="dsec" style={{ marginTop: 16 }}>{tr(locale, "detail_sec2")}</div>
      {d.related.length > 0 && <div className="related">{d.related.map((r) => <button key={r} className="relbtn" onClick={() => jumpRelated(r)}>{r} ↗</button>)}</div>}
      {d.sources.length > 0
        ? d.sources.map((s, i) => <a key={i} className="src" href={s.url} target="_blank" rel="noopener noreferrer"><span style={{ color: "var(--faint)", flex: "0 0 auto" }}><LinkIcon /></span><span style={{ flex: 1, minWidth: 0 }}><b>{s.title}</b><small>{s.site}</small></span></a>)
        : <div className="nosrc">{tr(locale, "detail_nosrc")}</div>}
      <button className={`keepbtn big ${t.kept ? "on" : ""}`} onClick={() => toggleKeep(t.id)}>{t.kept ? tr(locale, "keep_detail_on") : tr(locale, "keep_detail_off")}</button>
    </div>
  );
}

function Card({ t, i, state, toggleKeep, toggleDetail, jumpRelated }: { t: UITerm; i: number; state: State; toggleKeep: (id: string) => void; toggleDetail: (id: string) => void; jumpRelated: (n: string) => void }) {
  const loc = state.locale;
  const open = state.openId === t.id;
  const animStyle = t._new ? { animation: `cardIn .42s ease both`, animationDelay: `${i * 55}ms` } : undefined;
  return (
    <div className={`card ${open ? "open" : ""}${t.kept ? " kept" : ""}`} style={animStyle}>
      <div className="crow" onClick={() => toggleDetail(t.id)} role="button" aria-expanded={open} tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleDetail(t.id); } }}>
        <span className="pri">{t.priority}</span>
        <div className="cbody">
          <div className="ctitle">
            <span className="term">{t.term}</span>
            <span className="kind" style={{ background: "var(--surface-2)", color: "var(--muted)" }}>{t.kind}</span>
            {state.groupView && t.group && <span className="gchip">{t.group}</span>}
            {t.kept && <span className="badge-ok">{tr(loc, "keep_on")}</span>}
          </div>
          <div className="oneline">{sentLines(t.one_line)}</div>
          <div className="why"><b>{tr(loc, "why_label")}</b><span>{firstSentence(t.why)}</span></div>
        </div>
        <button className={`keepmini ${t.kept ? "on" : ""}`} onClick={(e) => { e.stopPropagation(); toggleKeep(t.id); }} aria-label={t.kept ? tr(loc, "keep_on") : tr(loc, "keep_off")} title={t.kept ? tr(loc, "keep_on") : tr(loc, "keep_off")}><BookmarkIcon /></button>
        <span className="chev"><Chev /></span>
      </div>
      {open && <Detail t={t} locale={loc} opening={state.opening === t.id} jumpRelated={jumpRelated} toggleKeep={toggleKeep} />}
    </div>
  );
}

function Terms({ state, merge, loadMore, toggleKeep, toggleDetail, jumpRelated, go, refine, genGroup }: { state: State; merge: (p: Partial<State>) => void; loadMore: () => void; toggleKeep: (id: string) => void; toggleDetail: (id: string) => void; jumpRelated: (n: string) => void; go: (s: Screen) => void; refine: (text: string) => void; genGroup: (group: string) => void }) {
  const loc = state.locale;
  const revealed = state.terms.slice(0, state.visibleCount);
  let active = [...revealed];
  if (state.groupView) active = [...active].sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.priority - b.priority);
  const keptCount = revealed.filter((t) => t.kept).length;
  let lastG: string | undefined;
  return (
    <>
      <main className="scroll"><div style={{ padding: "13px 13px 14px" }}>
        <div className="tagrow"><span className="minitag">{state.classifyOut?.domain ?? tr(loc, "terms_domain_fallback")}</span><small>{tr(loc, "terms_domain_label")}</small></div>
        <div className="searchwrap"><SearchIcon /><input className="search" aria-label={tr(loc, "terms_refine_ph")} placeholder={tr(loc, "terms_refine_ph")} value={state.query} onChange={(e) => merge({ query: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); refine(state.query); } }} /></div>
        <div className="toolrow"><span className="hint">{tr(loc, "terms_count", { max: state.plan === "pro" ? state.limits.maxTotal.paid : state.limits.maxTotal.free, n: state.terms.length })}</span><button className={`toggle ${state.groupView ? "on" : ""}`} onClick={() => merge({ groupView: !state.groupView })}>{state.groupView ? tr(loc, "group_off") : tr(loc, "group_on")}</button></div>
        {state.errorMsg && <div className="taghint" style={{ color: "var(--warn-ink)" }}><span>{state.errorMsg}</span></div>}
        {active.length > 0 ? active.map((t, i) => {
          const head = state.groupView && t.group !== lastG ? <div key={"g" + t.id} className="grouphead"><b>{t.group}</b><i /><button className="groupgen" onClick={() => genGroup(t.group as string)} disabled={!!state.groupGenLoading}>{state.groupGenLoading === t.group ? tr(loc, "group_gen_loading") : tr(loc, "group_gen", { n: state.plan === "pro" ? state.limits.groupGen.paid : state.limits.groupGen.free })}</button></div> : null;
          lastG = t.group;
          return <div key={t.id}>{head}<Card t={t} i={i} state={state} toggleKeep={toggleKeep} toggleDetail={toggleDetail} jumpRelated={jumpRelated} /></div>;
        }) : <p className="note" style={{ margin: "24px 0" }}>{state.streaming ? tr(loc, "terms_loading") : tr(loc, "terms_nomatch")}</p>}
        {state.moreLoaded
          ? <button className="more done">{tr(loc, "more_done")}</button>
          : <button className="more" onClick={loadMore}>{state.moreLoading ? tr(loc, "more_loading") : tr(loc, "more_load")}</button>}
        <p className="note" style={{ marginTop: 13 }}>{tr(loc, "terms_foot_note")}</p>
      </div></main>
      <div className="foot">
        <div style={{ flex: 1, fontSize: 12.5, color: "var(--muted)" }}>{tr(loc, "kept_count", { n: keptCount })}</div>
        <button className="btn-ghost" style={{ width: "auto", padding: "9px 15px", borderRadius: 10, fontSize: 14.5, fontWeight: 600 }} onClick={() => go("kept")} disabled={keptCount === 0}>{tr(loc, "kept_view")}</button>
      </div>
    </>
  );
}

function Kept({ state, merge, go, goHome, toggleKeep, toggleDetail, jumpRelated, buildSummary, onCopy, onShare, aiRefine }: { state: State; merge: (p: Partial<State>) => void; go: (s: Screen) => void; goHome: () => void; toggleKeep: (id: string) => void; toggleDetail: (id: string) => void; jumpRelated: (n: string) => void; buildSummary: (s: State) => string; onCopy: () => void; onShare: () => void; aiRefine: () => void }) {
  const loc = state.locale;
  const copyLabel = state.copied ? tr(loc, "copy_done") : tr(loc, "copy");
  const kept = state.terms.filter((t) => t.kept);
  return (
    <main className="scroll"><div className="pad" style={{ display: "flex", flexDirection: "column" }}>
      <button className="link" style={{ alignSelf: "flex-start", color: "var(--muted)", marginBottom: 13 }} onClick={() => (state.histView ? goHome() : go("terms"))}>{state.histView ? tr(loc, "kept_back_home") : tr(loc, "kept_back_terms")}</button>
      <h2>{tr(loc, "kept_title")}{state.input ? ` · ${state.input}` : ""}</h2>
      <p className="lead" style={{ margin: "4px 0 14px" }}>{kept.length ? tr(loc, "kept_some", { n: kept.length }) : tr(loc, "kept_none")}</p>
      {kept.map((t, i) => <Card key={t.id} t={t} i={i} state={state} toggleKeep={toggleKeep} toggleDetail={toggleDetail} jumpRelated={jumpRelated} />)}
      {kept.length > 0 && <>
        <div className="dsec" style={{ marginTop: 16 }}>{tr(loc, "paste_head")}</div>
        <p className="note" style={{ margin: "4px 0 0" }}>{tr(loc, "paste_sub")}</p>
        <div className="summary" style={{ marginTop: 12 }}>{buildSummary(state)}</div>
        <div className="actrow">
          <button className="pillbtn ghost" onClick={onShare}><ShareIcon />{state.shareNote ? tr(loc, "share_done") : tr(loc, "share")}</button>
          <button className="pillbtn primary" onClick={onCopy}><CopyIcon />{copyLabel}</button>
        </div>
        {state.copyFailed && <p className="note" style={{ textAlign: "right", color: "var(--warn-ink)", marginTop: 6 }}>{tr(loc, "copy_fail")}</p>}
        <div className="dsec" style={{ marginTop: 16 }}>{tr(loc, "ai_extra")}</div>
        <div className="refinerow">
          <input className="field" style={{ flex: 3 }} aria-label={tr(loc, "refine_dir_ph")} placeholder={tr(loc, "refine_dir_ph")} value={state.ctxInput} onChange={(e) => merge({ ctxInput: e.target.value })} />
          <button className="btn btn-ghost refinebtn" style={{ flex: 1 }} onClick={aiRefine}><span className="rlabel">{state.aiSummaryLoading ? tr(loc, "refine_loading") : state.plan === "pro" ? tr(loc, "refine") : <>{tr(loc, "refine_locked")}<LockIcon /></>}</span></button>
        </div>
        {state.aiSummary && <div className="summary" style={{ marginTop: 10 }}>{state.aiSummary}</div>}
      </>}
      <button className="link" style={{ alignSelf: "center", color: "var(--muted)", marginTop: 14 }} onClick={goHome}>{tr(loc, "restart")}</button>
      <p className="note">{tr(loc, "kept_note")}</p>
    </div></main>
  );
}

function Paywall({ state, closePaywall, onUpgrade }: { state: State; closePaywall: () => void; onUpgrade: () => void }) {
  const loc = state.locale;
  return (
    <main className="scroll"><div className="pad" style={{ display: "flex", flexDirection: "column" }}>
      <button className="link" style={{ alignSelf: "flex-start", color: "var(--muted)", marginBottom: 14 }} onClick={closePaywall}>{tr(loc, "pw_close")}</button>
      {state.limitHit && <div className="callout"><b>{tr(loc, "pw_limit")}</b><p>{sentLines(tr(loc, "pw_limit_sub"))}</p></div>}
      <h2>{tr(loc, "pw_using", { plan: state.plan === "pro" ? "pro" : "flash" })}</h2>
      <p className="lead" style={{ margin: "4px 0 16px" }}>{state.plan === "pro" ? tr(loc, "plan_unlimited") : tr(loc, "plan_free_left", { n: state.remaining })}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="plancard"><div className="ph"><b>{tr(loc, "pw_free_card")}</b><span>₩0</span></div><ul><li>{tr(loc, "pw_free_1")}</li><li>{tr(loc, "pw_free_2")}</li><li>{tr(loc, "pw_free_3")}</li></ul></div>
        <div className="plancard hi"><div className="ribbon">{tr(loc, "pw_reco")}</div><div className="ph"><b>{tr(loc, "pw_pro_card")}</b><span className="hl">{tr(loc, "pw_pro_price")}</span></div><ul><li>{tr(loc, "pw_pro_1")}</li><li>{tr(loc, "pw_pro_2")}</li><li>{tr(loc, "pw_pro_3")}</li><li>{tr(loc, "pw_pro_4")}</li><li>{tr(loc, "pw_pro_5")}</li></ul></div>
      </div>
      <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={onUpgrade}>{state.plan === "pro" ? tr(loc, "pw_preview_on") : tr(loc, "pw_preview")}</button>
      <p className="note">{tr(loc, "pw_note")}</p>
    </div></main>
  );
}

function Refusal({ state, goHome }: { state: State; goHome: () => void }) {
  const loc = state.locale;
  return (
    <div className="center">
      <div className="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 20, height: 20 }}><path d="M12 8v5M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg></div>
      <h2>{tr(loc, "refusal_title")}</h2>
      <p className="lead" style={{ margin: 0 }}>{sentLines(tr(loc, "refusal_lead"))}</p>
      <button className="btn btn-ghost" style={{ width: "auto", padding: "11px 18px" }} onClick={goHome}>{tr(loc, "refusal_retry")}</button>
    </div>
  );
}

// 텍스트에서 주어진 용어를 찾아 <em>로 감싼다(튜토리얼 1스텝의 전문 용어 강조용).
function markTerms(text: string, terms: string[]): ReactNode[] {
  const list = terms.map((t) => t.trim()).filter(Boolean);
  if (!list.length) return [text];
  const esc = list.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${esc.join("|")})`, "g");
  return text.split(re).map((p, i) => (list.includes(p) ? <em key={i}>{p}</em> : <span key={i}>{p}</span>));
}
// 쉼표를 줄바꿈으로 바꿔 표시한다(쉼표 제거, 각 절을 한 줄로). 튜토리얼 문장·답변용.
function commaLines(text: string): ReactNode[] {
  return text.split(",").map((s, i) => <span key={i}>{i > 0 && <br />}{s.trim()}</span>);
}
// 3스텝 은하계 분야 맵의 노드 좌표(중심 코어 기준으로 흩뿌림).
const GALAXY_POS = [
  { left: "50%", top: "13%" }, { left: "76%", top: "20%" }, { left: "89%", top: "46%" }, { left: "78%", top: "74%" },
  { left: "52%", top: "88%" }, { left: "24%", top: "80%" }, { left: "11%", top: "54%" }, { left: "21%", top: "23%" },
  { left: "63%", top: "39%" }, { left: "37%", top: "37%" }, { left: "70%", top: "61%" }, { left: "32%", top: "63%" },
];

// 첫 방문 안내 팝업. 4스텝 — ①②③ 제품의 목적·이유(문장마다 사례 예시) ④ 사용방법. 백드롭/시작하기로 닫는다.
function Tutorial({ state, onClose }: { state: State; onClose: () => void }) {
  const loc = state.locale;
  const [step, setStep] = useState(0);
  const LAST = 3;
  const fields = tr(loc, "tut_p3_eg").split(",");
  return (
    <div className="modalBackdrop" onClick={onClose}>
      <div className="modalCard tut" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="tutIcon"><Spark /></div>
        {step === 0 && <>
          {/* 이유1: AI 답이 전문가 수준이라 이해하기 어렵다. Claude 채팅을 모방한 사례. */}
          <p className="tutSentence">{commaLines(tr(loc, "tut_p1"))}</p>
          <div className="tutChat" aria-hidden="true">
            <div className="tcUser">{tr(loc, "tut_q1")}</div>
            <div className="tcAI">
              <span className="tcAvatar"><Spark /></span>
              <div className="tcMsg">{tr(loc, "tut_a1").split(",").map((seg, i) => <span key={i}>{i > 0 && <br />}{markTerms(seg.trim(), tr(loc, "tut_a1_hl").split(","))}</span>)}</div>
            </div>
            <div className="tutEgCap">{tr(loc, "tut_p1_cap")}</div>
          </div>
        </>}
        {step === 1 && <>
          {/* 이유2: 핵심 어휘를 쥐면 읽힌다. 우리 어휘 카드의 미니 버전. */}
          <p className="tutSentence">{commaLines(tr(loc, "tut_p2"))}</p>
          <div className="tutCards" aria-hidden="true">
            <div className="tutCard">
              <span className="pri">1</span>
              <div className="tcBody"><div className="tcTitle"><b>{tr(loc, "tut_card_term")}</b><span className="tcKind">{tr(loc, "tut_card_kind")}</span></div><p>{tr(loc, "tut_card_line")}</p></div>
            </div>
            <div className="tutCard">
              <span className="pri">2</span>
              <div className="tcBody"><div className="tcTitle"><b>{tr(loc, "tut_card2_term")}</b><span className="tcKind warn">{tr(loc, "tut_card2_kind")}</span></div><p>{tr(loc, "tut_card2_line")}</p></div>
            </div>
            <div className="tutEgCap">{tr(loc, "tut_p2_cap")}</div>
          </div>
        </>}
        {step === 2 && <>
          {/* 이유3: 탑다운 시대, 남의 분야를 빠르게 익히는 힘. 은하계처럼 뻗은 분야 맵. */}
          <p className="tutSentence">{commaLines(tr(loc, "tut_p3"))}</p>
          <div className="tutGalaxy" aria-hidden="true">
            <span className="tgCore"><UserIcon /></span>
            {fields.map((d, i) => <span key={d} className="tgNode" style={GALAXY_POS[i % GALAXY_POS.length]}>{d.trim()}</span>)}
          </div>
        </>}
        {step === 3 && <>
          <h2>{tr(loc, "tut_how_title")}</h2>
          <ol className="tutSteps">
            <li><b>1</b><span>{tr(loc, "tut_step1")}</span></li>
            <li><b>2</b><span>{tr(loc, "tut_step2")}</span></li>
            <li><b>3</b><span>{tr(loc, "tut_step3")}</span></li>
          </ol>
        </>}
        <div className="row2">
          {step > 0 && <button className="btn btn-ghost" style={{ flex: 1 }} onClick={() => setStep(step - 1)}>{tr(loc, "tut_back")}</button>}
          {step < LAST
            ? <button className="btn btn-primary" style={{ flex: step > 0 ? 2 : 1 }} onClick={() => setStep(step + 1)}>{tr(loc, "tut_next")}</button>
            : <button className="btn btn-primary" style={{ flex: 2 }} onClick={onClose}>{tr(loc, "tut_start")}</button>}
        </div>
        <div className="tutDots">{[0, 1, 2, 3].map((i) => <i key={i} className={step === i ? "on" : ""} />)}</div>
      </div>
    </div>
  );
}
