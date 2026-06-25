// 배경노트(Vock note) 사이드패널 — panel.html(UI 정본) 화면을 React로 이식하고 실 API에 배선.
// UI 문자열은 i18n.ts의 t()(여기선 tr)로 가져온다. LLM 콘텐츠는 워커가 출력 언어로 만든다(별개).
import { useReducer, useRef, useEffect, useCallback, type ReactNode, type DragEvent } from "react";
import type {
  Prompt1Out, Choice, Term, Prompt5Out, Tag, RecommendInput, ClientLimits, OutputLocale,
} from "@sidetab/shared";
import * as api from "./api.js";
import { DEFAULT_CLIENT_LIMITS } from "./api.js";
import { loadSessions, saveSession, type SessionRec, type KeptTerm } from "./history.js";
import { t as tr, LOCALE_LABELS, CHIPS } from "./i18n.js";

// ---------- 타입 ----------
type Screen = "entry" | "narrow" | "terms" | "kept" | "paywall" | "refusal";
interface UITerm extends Term {
  id: string;
  kept: boolean;
  deepened: boolean;
  _new: boolean;
  detail?: Prompt5Out;
  detailLoading?: boolean;
}
interface Q { question: string; choices: Choice[] }
interface State {
  screen: Screen;
  input: string; cond: string; showCond: boolean; allChips: boolean; inputErr: boolean;
  attachedFile: { name: string; text: string } | null; dragging: boolean; attachNote: string;
  classifyOut: Prompt1Out | null;
  questions: Q[]; answers: string[][]; sel: string[];
  confidence: number; pending: boolean;
  customText: string; customOpen: boolean; // 아키네이터 직접 입력
  terms: UITerm[]; visibleCount: number; openId: string | null; opening: string | null;
  query: string; groupView: boolean; detailCount: number;
  moreLoading: boolean; moreLoaded: boolean; streaming: boolean;
  ctxInput: string; copied: boolean; copyFailed: boolean; shareNote: boolean;
  aiSummary: string; aiSummaryLoading: boolean;
  plan: "flash" | "pro"; remaining: number; prevScreen: Screen; limitHit: boolean;
  errorMsg: string;
  sessionId: string; history: SessionRec[]; histView: boolean;
  limits: ClientLimits; locale: OutputLocale;
}
const MIN_Q = 3;
const HIGHRISK = /(의료|진단|병원|처방|법률|소송|변호|판결|고소|세무신고|증상|치료)/;
const LOCALE_TAG: Record<OutputLocale, string> = { ko: "ko-KR", en: "en-US", ja: "ja-JP", zh: "zh-CN" };

function initial(): State {
  return {
    screen: "entry", input: "", cond: "", showCond: false, allChips: false, inputErr: false,
    attachedFile: null, dragging: false, attachNote: "",
    classifyOut: null, questions: [], answers: [], sel: [], confidence: 0, pending: false, customText: "", customOpen: false,
    terms: [], visibleCount: 0, openId: null, opening: null, query: "", groupView: false, detailCount: 0,
    moreLoading: false, moreLoaded: false, streaming: false,
    ctxInput: "", copied: false, copyFailed: false, shareNote: false, aiSummary: "", aiSummaryLoading: false,
    plan: "flash", remaining: 5, prevScreen: "entry", limitHit: false, errorMsg: "",
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
// 문장 단위 줄바꿈: 마침표/물음표/느낌표 뒤(공백 동반)에서 줄을 나눠 <br/>로.
function sentLines(t: string): ReactNode[] {
  const parts = t.split(/([.!?]\s+)/);
  const out: ReactNode[] = []; let buf = "";
  for (const p of parts) {
    buf += p;
    if (/[.!?]\s+$/.test(p)) { out.push(buf.trimEnd()); out.push(<br key={out.length} />); buf = ""; }
  }
  if (buf) out.push(buf);
  return out;
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

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initial);
  const sref = useRef(state); sref.current = state;
  const abortRef = useRef<AbortController | null>(null);
  const merge = useCallback((patch: Partial<State>) => dispatch({ type: "merge", patch }), []);
  const later = (fn: () => void, ms: number) => window.setTimeout(fn, ms);

  // ----- 진입 -----
  const go = (screen: Screen) => merge({ screen });
  const goHome = () => dispatch({ type: "reset" });

  const startNarrow = useCallback(async (raw: string) => {
    merge({ pending: true, screen: "narrow", answers: [], sel: [], questions: [], input: raw });
    try {
      const p1 = await api.classify({ raw_input: raw, ...(sref.current.attachedFile ? { context_object: sref.current.attachedFile.text } : {}) });
      if (p1.domain_risk === "high") { merge({ pending: false, screen: "refusal" }); return; }
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
    merge({ sel: next });
  };
  const nextStep = useCallback(async () => {
    const s = sref.current;
    const custom = s.customText.trim();
    const picked = custom ? [...s.sel, custom] : s.sel; // 칩 + 직접 입력 합산(ⓑ)
    if (picked.length === 0) return;
    const answers = [...s.answers, picked];
    merge({ answers, sel: [], customText: "", customOpen: false, pending: true });
    const history = answers.flat().map((label) => ({ label, action: "선택" as const }));
    try {
      const p2 = await api.nextBranch({ domain: s.classifyOut?.domain ?? "", job_type: s.classifyOut?.job_type ?? [], history, ...(s.attachedFile ? { context_object: s.attachedFile.text } : {}) });
      // 좁히기 최대 턴은 워커 한도(limits.narrowMax)에서 온다. free는 적게, paid는 의중이 갈릴 때만 더.
      const maxQ = s.plan === "pro" ? s.limits.narrowMax.paid : s.limits.narrowMax.free;
      const enough = (answers.length >= MIN_Q && p2.enough) || answers.length >= maxQ;
      if (enough) { merge({ pending: false, confidence: p2.confidence }); void runRecommend(); return; }
      merge({ pending: false, confidence: p2.confidence, questions: [...s.questions, { question: p2.question, choices: p2.choices }] });
    } catch (e) {
      merge({ pending: false, screen: "terms", errorMsg: msg(e) });
    }
  }, [merge]);
  const undoStep = () => { const s = sref.current; if (s.answers.length) merge({ answers: s.answers.slice(0, -1), sel: [], customText: "", customOpen: false }); };
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
  const runRecommend = useCallback(async () => {
    const s = sref.current;
    if (s.remaining <= 0) { merge({ prevScreen: s.screen, screen: "paywall", limitHit: true }); return; }
    abortRef.current?.abort();
    const ctrl = new AbortController(); abortRef.current = ctrl;
    merge({ screen: "terms", terms: [], visibleCount: 0, openId: null, streaming: true, errorMsg: "", moreLoaded: false, query: "", remaining: Math.max(0, s.remaining - 1), sessionId: crypto.randomUUID(), histView: false, detailCount: 0 });
    await api.streamRecommend(buildRecInput(), s.plan === "pro" ? "paid" : "free", (ev) => {
      if (ev.type === "term") {
        const id = "t" + sref.current.terms.length;
        dispatch({ type: "addTerm", term: { ...ev.term, id, kept: false, deepened: false, _new: true } });
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
    merge({ moreLoading: true });
    const exclude = s.terms.map((t) => t.term);
    let got = 0;
    const ctrl = new AbortController();
    await api.streamRecommend(buildRecInput(exclude), s.plan === "pro" ? "paid" : "free", (ev) => {
      if (ev.type === "term") {
        // 카드 번호는 기존 개수에 이어서 매긴다(더보기 시 1부터 재시작 버그 수정).
        got++; const n = sref.current.terms.length; const id = "m" + n;
        dispatch({ type: "addTerm", term: { ...ev.term, priority: n + 1, id, kept: false, deepened: false, _new: true } });
        later(() => dispatch({ type: "updateTerm", id, patch: { _new: false } }), 780);
      }
    }, ctrl.signal).catch(() => {});
    merge({ moreLoading: false, moreLoaded: got === 0 });
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
  const doDeepen = (id: string) => {
    // "더 깊이"는 유료 전용 제품 혜택. 무료는 페이월로 안내한다.
    if (sref.current.plan !== "pro") { merge({ prevScreen: sref.current.screen, screen: "paywall", limitHit: false }); return; }
    dispatch({ type: "updateTerm", id, patch: { deepened: true } });
  };

  // ----- 요약(출력 언어로) -----
  const buildSummary = (s: State): string => {
    const loc = s.locale;
    const names = s.terms.filter((t) => t.kept).map((t) => t.term);
    const cond = (s.ctxInput || s.cond || "").trim(); const ctxObj = s.input.trim();
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
      id: "h" + i, kept: true, deepened: false, _new: false, ...(k.detail ? { detail: k.detail } : {}),
    }));
    merge({
      screen: "kept", histView: true, terms, visibleCount: terms.length, openId: null,
      sessionId: rec.id, input: rec.topic, ctxInput: "", aiSummary: "",
      classifyOut: { domain: rec.area, job_type: [], condition_required: false, question: "", choices: [], search_locale: rec.locale === "ko" ? "ko" : "en", domain_risk: "low" },
    });
  };

  const openPaywall = () => merge({ prevScreen: sref.current.screen, screen: "paywall", limitHit: false });
  const closePaywall = () => merge({ screen: sref.current.prevScreen === "paywall" ? "entry" : sref.current.prevScreen });
  const onUpgrade = () => { merge({ plan: "pro", remaining: 99 }); later(closePaywall, 350); };
  // 언어 변경: api 헤더·로컬 저장·상태를 함께 갱신한다(재빌드 없이 즉시 반영).
  const changeLocale = (l: OutputLocale) => {
    api.setLocale(l);
    try { localStorage.setItem("sidetab:locale", l); } catch { /* 무시 */ }
    merge({ locale: l });
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

  const live = state.screen === "narrow";
  return (
    <div id="app" className={live ? "live" : ""} role="application" aria-label="Vock note">
      {state.pending && <div className="bar" role="status"><i /></div>}
      <Header state={state} openPaywall={openPaywall} goHome={goHome} changeLocale={changeLocale} />
      {state.screen === "entry" && <Entry state={state} merge={merge} submitEntry={submitEntry} chip={chip} openHistory={openHistory} acceptFile={acceptFile} attachPaywall={attachPaywall} removeAttached={removeAttached} />}
      {state.screen === "narrow" && <Narrow state={state} merge={merge} toggleSel={toggleSel} nextStep={nextStep} undoStep={undoStep} jumpToTerms={jumpToTerms} />}
      {state.screen === "terms" && <Terms state={state} merge={merge} loadMore={loadMore} toggleKeep={toggleKeep} toggleDetail={toggleDetail} jumpRelated={jumpRelated} doDeepen={doDeepen} go={go} />}
      {state.screen === "kept" && <Kept state={state} merge={merge} go={go} goHome={goHome} toggleKeep={toggleKeep} toggleDetail={toggleDetail} jumpRelated={jumpRelated} doDeepen={doDeepen} buildSummary={buildSummary} onCopy={onCopy} onShare={onShare} aiRefine={aiRefine} />}
      {state.screen === "paywall" && <Paywall state={state} closePaywall={closePaywall} onUpgrade={onUpgrade} />}
      {state.screen === "refusal" && <Refusal state={state} goHome={goHome} />}
    </div>
  );
}

function msg(e: unknown): string { return e instanceof Error ? e.message : String(e); }

// ---------- 화면 컴포넌트 ----------
function Header({ state, openPaywall, goHome, changeLocale }: { state: State; openPaywall: () => void; goHome: () => void; changeLocale: (l: OutputLocale) => void }) {
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
        <select className="langsel" aria-label={tr(state.locale, "lang_label")} value={state.locale} onChange={(e) => changeLocale(e.target.value as OutputLocale)}>
          {(Object.keys(LOCALE_LABELS) as OutputLocale[]).map((l) => <option key={l} value={l}>{LOCALE_LABELS[l]}</option>)}
        </select>
        <button className={`plan ${warn ? "warn" : ""}`} onClick={openPaywall}>
          {state.plan === "pro" ? <><b>pro</b><span>{tr(state.locale, "plan_unlimited")}</span></> : <><b>flash</b><span>{tr(state.locale, "plan_free_left", { n: state.remaining })}</span></>}
        </button>
      </div>
    </header>
  );
}

function Entry({ state, merge, submitEntry, chip, openHistory, acceptFile, attachPaywall, removeAttached }: { state: State; merge: (p: Partial<State>) => void; submitEntry: () => void; chip: (t: string) => void; openHistory: (rec: SessionRec) => void; acceptFile: (f: File) => void; attachPaywall: () => void; removeAttached: () => void }) {
  const loc = state.locale;
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const grow = () => { const el = taRef.current; if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 160) + "px"; } };
  useEffect(grow, []);
  const all = CHIPS[loc] ?? CHIPS.ko;
  const list = state.allChips ? all : all.slice(0, 4);
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
        <p className="heroSub">{sentLines(tr(loc, "entry_sub"))}</p>
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
              <button className="attach" onClick={() => fileRef.current?.click()} aria-label={tr(loc, "attach")} title={tr(loc, "attach")}>📎</button>
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
          {list.map((c) => <button key={c} className="sg" onClick={() => chip(c)}>{c}</button>)}
          {!state.allChips && <button className="sg more" onClick={() => merge({ allChips: true })}>{tr(loc, "more")}</button>}
        </div>
        {state.history.length > 0 && (
          <div className="history">
            <div className="histhead">{tr(loc, "history_head")}</div>
            {state.history.slice(0, 8).map((h) => (
              <button key={h.id} className="histitem" onClick={() => openHistory(h)}>
                <span className="histtopic">{h.topic || tr(loc, "history_untitled")}</span>
                <span className="histmeta">{tr(loc, "history_meta", { n: h.terms.length, date: fmtDate(h.createdAt, loc) })}</span>
              </button>
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
  // 입력 길이에 따라 높이가 늘어나는 적응형 입력(최대 140px 후 내부 스크롤).
  const growCustom = () => { const el = customRef.current; if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 140) + "px"; } };
  if (state.pending) {
    return (<main className="scroll entryMain"><div className="thinking">
      <div className="aiav"><Spark /></div>
      <div className="msg">{sentLines(tr(loc, "thinking"))}</div>
      <div className="dots3"><i /><i /><i /></div>
    </div></main>);
  }
  const idx = state.answers.length;
  const cur = state.questions[idx] ?? state.questions[state.questions.length - 1];
  // 진행은 confidence와 진행 위치(목표 3턴) 중 큰 값으로 부드럽게 채운다(점 팝 없음).
  const pct = Math.round(Math.max(state.confidence, Math.min(idx, 3) / 3) * 100);
  // 4번째 질문부터는 pro 전용 심화 구간(무료는 3턴에서 종료되므로 자연히 pro만 도달).
  const proPhase = idx >= 3;
  return (
    <main className="scroll"><div className="pad" style={{ display: "flex", flexDirection: "column" }}>
      <div className="aiwrap">
        <span className="aiav"><Spark /></span>
        <span className="aimeta">{tr(loc, "narrow_ai", { n: idx + 1 })}{state.confidence >= 0.75 ? tr(loc, "narrow_almost") : ""}</span>
        {state.answers.length > 0 && <button className="link" style={{ marginLeft: "auto" }} onClick={undoStep}>{tr(loc, "undo")}</button>}
      </div>
      <div className={`progress${proPhase ? " pro" : ""}`} style={{ marginBottom: 16 }}>
        <div className="track"><i style={{ width: pct + "%" }} /></div>
        {proPhase && <span className="prophase">{tr(loc, "prophase")}</span>}
        {state.plan !== "pro" && <span className="prolock" title={tr(loc, "prolock_title")}>{tr(loc, "prolock")}</span>}
      </div>
      <h2>{sentLines(cur?.question ?? "")}</h2>
      <p className="lead" style={{ margin: "6px 0 16px" }}>{tr(loc, "narrow_lead")}</p>
      {(cur?.choices ?? []).map((o) => {
        const on = state.sel.includes(o.label);
        return <button key={o.label} className={`opt ${on ? "sel" : ""}`} onClick={() => toggleSel(o.label)}><span>{o.label}</span><span className="tick">✓</span></button>;
      })}
      {state.customOpen
        ? <textarea ref={customRef} className="field" rows={1} autoFocus aria-label={tr(loc, "custom_open")} placeholder={tr(loc, "custom_ph")} value={state.customText} style={{ marginTop: 9 }}
            onChange={(e) => { merge({ customText: e.target.value }); growCustom(); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); nextStep(); } }} />
        : <button className="dash" style={{ marginTop: 9 }} onClick={() => merge({ customOpen: true })}>{tr(loc, "custom_open")}</button>}
      <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={nextStep} disabled={state.sel.length === 0 && !state.customText.trim()}>{tr(loc, "next")}</button>
      <p className="note" style={{ marginTop: 12 }}>{tr(loc, "narrow_note")}</p>
      <button className="link" style={{ marginTop: 8, alignSelf: "center" }} onClick={jumpToTerms}>{tr(loc, "narrow_jump")}</button>
    </div></main>
  );
}

function Detail({ t, locale, opening, jumpRelated, doDeepen, toggleKeep }: { t: UITerm; locale: OutputLocale; opening: boolean; jumpRelated: (n: string) => void; doDeepen: (id: string) => void; toggleKeep: (id: string) => void }) {
  if (t.detailLoading || !t.detail) return <div className="detail"><div className="dbody"><p style={{ color: "var(--muted)" }}>{tr(locale, "detail_loading")}</p></div></div>;
  const d = t.detail;
  const how = d.how;
  return (
    <div className={`detail${opening ? " animin" : ""}`}>
      <div className="dsec">{tr(locale, "detail_sec1")}</div>
      <div className="dbody">
        <p>{sentLines(d.what)}</p><p>{sentLines(d.whymine)}</p><p>{sentLines(how)}</p>
        {t.context_note && <p><b className="tag-in">{tr(locale, "detail_ctx")}</b>{sentLines(t.context_note)}</p>}
        {t.direction && <p><b className="tag-in">{tr(locale, "detail_dir")}</b>{sentLines(t.direction)}</p>}
        {t.use_example && <p><b className="tag-in">{tr(locale, "detail_ex")}</b>{sentLines(t.use_example)}</p>}
        {d.misc && <div className="misc">{sentLines(d.misc)}</div>}
      </div>
      <div className="dsec" style={{ marginTop: 13 }}>{tr(locale, "detail_sec2")}</div>
      {d.related.length > 0 && <div className="related">{d.related.map((r) => <button key={r} className="relbtn" onClick={() => jumpRelated(r)}>{r} ↗</button>)}</div>}
      {d.sources.length > 0
        ? d.sources.map((s, i) => <a key={i} className="src" href={s.url} target="_blank" rel="noopener noreferrer"><span style={{ color: "var(--faint)", flex: "0 0 auto" }}><LinkIcon /></span><span style={{ flex: 1, minWidth: 0 }}><b>{s.title}</b><small>{s.site}</small></span></a>)
        : <div className="nosrc">{tr(locale, "detail_nosrc")}</div>}
      {t.deepened
        ? null
        : <button className="deepen" onClick={() => doDeepen(t.id)}>{tr(locale, "deepen")}</button>}
      <button className={`keepbtn big ${t.kept ? "on" : ""}`} onClick={() => toggleKeep(t.id)}>{t.kept ? tr(locale, "keep_detail_on") : tr(locale, "keep_detail_off")}</button>
    </div>
  );
}

function Card({ t, i, state, toggleKeep, toggleDetail, jumpRelated, doDeepen }: { t: UITerm; i: number; state: State; toggleKeep: (id: string) => void; toggleDetail: (id: string) => void; jumpRelated: (n: string) => void; doDeepen: (id: string) => void }) {
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
        <span className="chev"><Chev /></span>
      </div>
      {open && <Detail t={t} locale={loc} opening={state.opening === t.id} jumpRelated={jumpRelated} doDeepen={doDeepen} toggleKeep={toggleKeep} />}
      <div className="keeprow">
        <button className={`keepbtn ${t.kept ? "on" : ""}`} onClick={() => toggleKeep(t.id)}>{t.kept ? tr(loc, "keep_on") : tr(loc, "keep_off")}</button>
      </div>
    </div>
  );
}

function Terms({ state, merge, loadMore, toggleKeep, toggleDetail, jumpRelated, doDeepen, go }: { state: State; merge: (p: Partial<State>) => void; loadMore: () => void; toggleKeep: (id: string) => void; toggleDetail: (id: string) => void; jumpRelated: (n: string) => void; doDeepen: (id: string) => void; go: (s: Screen) => void }) {
  const loc = state.locale;
  const revealed = state.terms.slice(0, state.visibleCount);
  let active = [...revealed];
  const q = state.query.trim().toLowerCase();
  if (q) active = active.filter((t) => (t.term + " " + t.one_line).toLowerCase().includes(q));
  if (state.groupView) active = [...active].sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.priority - b.priority);
  const total = state.terms.length || 6;
  const pct = Math.round((state.visibleCount / Math.max(1, total)) * 100);
  const keptCount = revealed.filter((t) => t.kept).length;
  let lastG: string | undefined;
  return (
    <>
      <main className="scroll"><div style={{ padding: "13px 13px 14px" }}>
        <div className="tagrow"><span className="minitag">{state.classifyOut?.domain ?? tr(loc, "terms_domain_fallback")}</span><small>{tr(loc, "terms_domain_label")}</small></div>
        <div className="searchwrap"><SearchIcon /><input className="search" aria-label={tr(loc, "terms_search_ph")} placeholder={tr(loc, "terms_search_ph")} value={state.query} onChange={(e) => merge({ query: e.target.value })} /></div>
        <div className="progress"><div className="track"><i style={{ width: pct + "%" }} /></div><small>{state.visibleCount}/{total}</small></div>
        <div className="toolrow"><span className="hint"><i />{tr(loc, "terms_hint")}</span><button className={`toggle ${state.groupView ? "on" : ""}`} onClick={() => merge({ groupView: !state.groupView })}>{state.groupView ? tr(loc, "group_off") : tr(loc, "group_on")}</button></div>
        {state.errorMsg && <div className="taghint" style={{ color: "var(--warn-ink)" }}><span>{state.errorMsg}</span></div>}
        {active.length > 0 ? active.map((t, i) => {
          const head = state.groupView && t.group !== lastG ? <div key={"g" + t.id} className="grouphead"><b>{t.group}</b><i /></div> : null;
          lastG = t.group;
          return <div key={t.id}>{head}<Card t={t} i={i} state={state} toggleKeep={toggleKeep} toggleDetail={toggleDetail} jumpRelated={jumpRelated} doDeepen={doDeepen} /></div>;
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

function Kept({ state, merge, go, goHome, toggleKeep, toggleDetail, jumpRelated, doDeepen, buildSummary, onCopy, onShare, aiRefine }: { state: State; merge: (p: Partial<State>) => void; go: (s: Screen) => void; goHome: () => void; toggleKeep: (id: string) => void; toggleDetail: (id: string) => void; jumpRelated: (n: string) => void; doDeepen: (id: string) => void; buildSummary: (s: State) => string; onCopy: () => void; onShare: () => void; aiRefine: () => void }) {
  const loc = state.locale;
  const copyLabel = state.copyFailed ? tr(loc, "copy_fail") : state.copied ? tr(loc, "copy_done") : tr(loc, "copy");
  const kept = state.terms.filter((t) => t.kept);
  return (
    <main className="scroll"><div className="pad" style={{ display: "flex", flexDirection: "column" }}>
      <button className="link" style={{ alignSelf: "flex-start", color: "var(--muted)", marginBottom: 13 }} onClick={() => (state.histView ? goHome() : go("terms"))}>{state.histView ? tr(loc, "kept_back_home") : tr(loc, "kept_back_terms")}</button>
      <h2>{tr(loc, "kept_title")}{state.input ? ` · ${state.input}` : ""}</h2>
      <p className="lead" style={{ margin: "4px 0 14px" }}>{kept.length ? tr(loc, "kept_some", { n: kept.length }) : tr(loc, "kept_none")}</p>
      {kept.map((t, i) => <Card key={t.id} t={t} i={i} state={state} toggleKeep={toggleKeep} toggleDetail={toggleDetail} jumpRelated={jumpRelated} doDeepen={doDeepen} />)}
      {kept.length > 0 && <>
        <div className="dsec" style={{ marginTop: 16 }}>{tr(loc, "paste_head")}</div>
        <div className="label" style={{ marginTop: 8 }}>{tr(loc, "ctx_label")}</div>
        <input className="field" aria-label={tr(loc, "ctx_label")} placeholder={tr(loc, "ctx_ph")} value={state.ctxInput} onChange={(e) => merge({ ctxInput: e.target.value })} />
        <div className="summary" style={{ marginTop: 13 }}>{buildSummary(state)}</div>
        {state.aiSummary && <><div className="dsec" style={{ marginTop: 14 }}>{tr(loc, "ai_extra")}</div><div className="summary" style={{ marginTop: 6 }}>{state.aiSummary}</div></>}
        <div className="row2">
          <button className="btn btn-ghost" style={{ flex: 2 }} onClick={onCopy}>{copyLabel}</button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onShare}>{state.shareNote ? tr(loc, "share_done") : tr(loc, "share")}</button>
        </div>
        <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={aiRefine}>{state.aiSummaryLoading ? tr(loc, "refine_loading") : state.plan === "pro" ? tr(loc, "refine") : tr(loc, "refine_locked")}</button>
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
        <div className="plancard hi"><div className="ribbon">{tr(loc, "pw_reco")}</div><div className="ph"><b>{tr(loc, "pw_pro_card")}</b><span className="hl">{tr(loc, "pw_pro_price")}</span></div><ul><li>{tr(loc, "pw_pro_1")}</li><li>{tr(loc, "pw_pro_2")}</li><li>{tr(loc, "pw_pro_3")}</li></ul></div>
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
