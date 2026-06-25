// 배경어휘 사이드탭 사이드패널 — panel.html(UI 정본) 5화면을 React로 이식하고 실 API에 배선.
// 디자인/구조는 panel.html을 따른다(theme.css = panel.html style verbatim). mock↔실API는 api.ts가 스위치.
import { useReducer, useRef, useEffect, useCallback, type ReactNode } from "react";
import type {
  Prompt1Out, Choice, Term, Prompt5Out, Tag, RecommendInput,
} from "@sidetab/shared";
import * as api from "./api.js";
import { loadSessions, saveSession, type SessionRec, type KeptTerm } from "./history.js";

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
}
const MIN_Q = 3, MAX_Q = 8;
const HIGHRISK = /(의료|진단|병원|처방|법률|소송|변호|판결|고소|세무신고|증상|치료)/;
const CHIPS = [
  "졸업작품 모델이 자꾸 틀려요", "앱에 결제를 붙여야 해요", "추천 기능을 넣고 싶어요", "캐주얼 게임을 만들고 싶어요",
  "API를 연동해야 하는데 막막해요", "마케팅 데이터를 분석해야 해요", "계약서 조항을 모르겠어요", "투자 피칭 자료를 써야 해요",
];
const SUGGEST = CHIPS.slice(0, 4);

function initial(): State {
  return {
    screen: "entry", input: "", cond: "", showCond: false, allChips: false, inputErr: false,
    classifyOut: null, questions: [], answers: [], sel: [], confidence: 0, pending: false, customText: "", customOpen: false,
    terms: [], visibleCount: 0, openId: null, opening: null, query: "", groupView: false, detailCount: 0,
    moreLoading: false, moreLoaded: false, streaming: false,
    ctxInput: "", copied: false, copyFailed: false, shareNote: false, aiSummary: "", aiSummaryLoading: false,
    plan: "flash", remaining: 5, prevScreen: "entry", limitHit: false, errorMsg: "",
    sessionId: "", history: [], histView: false,
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
const INTENT_LABEL = "이 분야를 이해하고 활용";
// 받침 유무로 을/를 조사를 고른다(한글 음절만, 그 외는 를).
function eul(w: string): "을" | "를" {
  const c = w.charCodeAt(w.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return "를";
  return (c - 0xac00) % 28 !== 0 ? "을" : "를";
}
// 이전 탐색 항목의 날짜 표기(월 일).
function fmtDate(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
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
      const p1 = await api.classify({ raw_input: raw, ...(sref.current.cond ? { context_object: undefined } : {}) });
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
      const p2 = await api.nextBranch({ domain: s.classifyOut?.domain ?? "", job_type: s.classifyOut?.job_type ?? [], history });
      // free는 좁히기를 3턴에서 끝낸다(LLM 호출 절감). paid는 최대 MAX_Q까지 의중이 갈릴 때만 더 묻는다.
      const maxQ = s.plan === "pro" ? MAX_Q : 3;
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
    // 무료 상세 열람은 세션당 3회. 새로 불러오는 경우만 세고, 한도를 넘으면 페이월로 안내한다(캐시 재열람은 무제한).
    if (willFetch && s.plan !== "pro" && s.detailCount >= 3) {
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

  // ----- 요약 -----
  const buildSummary = (s: State): string => {
    const names = s.terms.filter((t) => t.kept).map((t) => t.term);
    const cond = (s.ctxInput || s.cond || "").trim(); const ctxObj = s.input.trim();
    const area = s.classifyOut?.domain ?? "이 분야";
    const L = [`나는 ${area} 영역에서 ${INTENT_LABEL}${eul(INTENT_LABEL)} 하려 한다.`];
    if (cond) L.push(`(내 상황: ${cond})`);
    if (names.length) L.push("담아둔 핵심어 " + names.join("·") + eul(names[names.length - 1]!) + " 짚었다.");
    else L.push("(어휘 화면에서 담은 어휘가 여기 정리돼요)");
    if (ctxObj) L.push(`(참고 맥락: ${ctxObj})`);
    L.push(""); L.push("이 개념들을 내 상황에 어떻게 적용하는지, 우선순위와 함께 구체적 예시로 알려줘.");
    L.push("— 배경어휘 사이드탭에서 정리함 (AI 생성 보조 어휘)");
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

  useEffect(() => () => abortRef.current?.abort(), []);
  // 진입 화면에 들어설 때마다 저장된 이전 탐색을 다시 읽어 리스트를 채운다(reset 후에도 갱신).
  useEffect(() => { if (state.screen === "entry") void loadSessions().then((list) => merge({ history: list })); }, [state.screen, merge]);

  const live = state.screen === "narrow";
  return (
    <div id="app" className={live ? "live" : ""} role="application" aria-label="배경어휘 사이드탭">
      {state.pending && <div className="bar" role="status" aria-label="불러오는 중이에요"><i /></div>}
      <Header state={state} openPaywall={openPaywall} goHome={goHome} />
      {state.screen === "entry" && <Entry state={state} merge={merge} submitEntry={submitEntry} chip={chip} openHistory={openHistory} />}
      {state.screen === "narrow" && <Narrow state={state} merge={merge} toggleSel={toggleSel} nextStep={nextStep} undoStep={undoStep} jumpToTerms={jumpToTerms} />}
      {state.screen === "terms" && <Terms state={state} merge={merge} loadMore={loadMore} toggleKeep={toggleKeep} toggleDetail={toggleDetail} jumpRelated={jumpRelated} doDeepen={doDeepen} go={go} />}
      {state.screen === "kept" && <Kept state={state} merge={merge} go={go} goHome={goHome} toggleKeep={toggleKeep} toggleDetail={toggleDetail} jumpRelated={jumpRelated} doDeepen={doDeepen} buildSummary={buildSummary} onCopy={onCopy} onShare={onShare} aiRefine={aiRefine} />}
      {state.screen === "paywall" && <Paywall state={state} closePaywall={closePaywall} onUpgrade={onUpgrade} />}
      {state.screen === "refusal" && <Refusal goHome={goHome} />}
    </div>
  );
}

function msg(e: unknown): string { return e instanceof Error ? e.message : String(e); }

// ---------- 화면 컴포넌트 ----------
function Header({ state, openPaywall, goHome }: { state: State; openPaywall: () => void; goHome: () => void }) {
  const warn = state.plan !== "pro" && state.remaining <= 2;
  return (
    <header>
      <button className="brand" onClick={goHome} aria-label="홈으로">
        <span className="logo"><i /><i /></span>
        <span><b>배경어휘</b><span>SIDE TAB</span></span>
      </button>
      <div className="htools">
        <button className={`plan ${warn ? "warn" : ""}`} onClick={openPaywall} aria-label="요금제">
          {state.plan === "pro" ? <><b>pro</b><span>무제한</span></> : <><b>flash</b><span>무료 {state.remaining}/7</span></>}
        </button>
      </div>
    </header>
  );
}

function Entry({ state, merge, submitEntry, chip, openHistory }: { state: State; merge: (p: Partial<State>) => void; submitEntry: () => void; chip: (t: string) => void; openHistory: (rec: SessionRec) => void }) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const grow = () => { const el = taRef.current; if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 160) + "px"; } };
  useEffect(grow, []);
  const list = state.allChips ? CHIPS : SUGGEST;
  return (
    <main className="scroll entryMain">
      <div className="hero">
        <h1 className="heroTitle">무슨 일 때문에 왔나요?</h1>
        <p className="heroSub">{sentLines("그 분야 핵심 어휘를 옆에 사전처럼 띄워둘게요. 막힌 용어나 문서를 붙여넣어도 돼요.")}</p>
        <div className={`composer ${state.inputErr ? "err" : ""}`}>
          <textarea ref={taRef} className="composerInput" rows={1} aria-label="무슨 일 때문에 왔는지 상황 입력"
            placeholder="무엇을 하려는지 한 줄로 적어주세요" value={state.input}
            onChange={(e) => { merge({ input: e.target.value }); grow(); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitEntry(); } }} />
          <div className="composerBar">
            <button className="condToggle" onClick={() => merge({ showCond: !state.showCond })}>{state.showCond ? "– 조건 접기" : "+ 조건 추가"}</button>
            <button className="send" onClick={submitEntry} aria-label="다음">→</button>
          </div>
        </div>
        {state.inputErr && <div className="errmsg" style={{ textAlign: "center" }}>상황을 한 줄 적거나 아래에서 골라주세요.</div>}
        {state.showCond && <input className="field condField" aria-label="좁혀줄 조건" placeholder="좁혀줄 조건 · 분야, 도구, 마감 등" value={state.cond} onChange={(e) => merge({ cond: e.target.value })} />}
        <div className="suggest">
          {list.map((c) => <button key={c} className="sg" onClick={() => chip(c)}>{c}</button>)}
          {!state.allChips && <button className="sg more" onClick={() => merge({ allChips: true })}>더 보기</button>}
        </div>
        {state.history.length > 0 && (
          <div className="history">
            <div className="histhead">이전 탐색 · 담은 어휘</div>
            {state.history.slice(0, 8).map((h) => (
              <button key={h.id} className="histitem" onClick={() => openHistory(h)}>
                <span className="histtopic">{h.topic || "(제목 없음)"}</span>
                <span className="histmeta">{h.terms.length}개 · {fmtDate(h.createdAt)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="note entryNote">AI가 만든 결과예요 · 의료, 법률처럼 개인 판단이 필요한 고위험 분야는 다루지 않아요</p>
    </main>
  );
}

function Narrow({ state, merge, toggleSel, nextStep, undoStep, jumpToTerms }: { state: State; merge: (p: Partial<State>) => void; toggleSel: (o: string) => void; nextStep: () => void; undoStep: () => void; jumpToTerms: () => void }) {
  const customRef = useRef<HTMLTextAreaElement>(null);
  // 입력 길이에 따라 높이가 늘어나는 적응형 입력(최대 140px 후 내부 스크롤).
  const growCustom = () => { const el = customRef.current; if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 140) + "px"; } };
  if (state.pending) {
    return (<main className="scroll entryMain"><div className="thinking">
      <div className="aiav"><Spark /></div>
      <div className="msg">AI가 답을 읽고<br />다음 질문을 고르는 중…</div>
      <div className="dots3"><i /><i /><i /></div>
    </div></main>);
  }
  const idx = state.answers.length;
  const cur = state.questions[idx] ?? state.questions[state.questions.length - 1];
  // 진행은 confidence와 진행 위치(목표 3턴) 중 큰 값으로 부드럽게 채운다(점 팝 없음).
  const pct = Math.round(Math.max(state.confidence, Math.min(idx, 3) / 3) * 100);
  return (
    <main className="scroll"><div className="pad" style={{ display: "flex", flexDirection: "column" }}>
      <div className="aiwrap">
        <span className="aiav"><Spark /></span>
        <span className="aimeta"><b>AI</b>가 좁히는 중 · {idx + 1}번째{state.confidence >= 0.75 ? " · 거의 다 좁혔어요" : ""}</span>
        {state.answers.length > 0 && <button className="link" style={{ marginLeft: "auto" }} onClick={undoStep}>↩ 되돌리기</button>}
      </div>
      <div className="progress" style={{ marginBottom: 16 }}><div className="track"><i style={{ width: pct + "%" }} /></div></div>
      <h2>{sentLines(cur?.question ?? "")}</h2>
      <p className="lead" style={{ margin: "6px 0 16px" }}>해당하는 걸 모두 고르세요 · 여러 개 가능</p>
      {(cur?.choices ?? []).map((o) => {
        const on = state.sel.includes(o.label);
        return <button key={o.label} className={`opt ${on ? "sel" : ""}`} onClick={() => toggleSel(o.label)}><span>{o.label}</span><span className="tick">✓</span></button>;
      })}
      {state.customOpen
        ? <textarea ref={customRef} className="field" rows={1} autoFocus aria-label="직접 입력" placeholder="원하는 답을 직접 적어주세요" value={state.customText} style={{ marginTop: 9 }}
            onChange={(e) => { merge({ customText: e.target.value }); growCustom(); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); nextStep(); } }} />
        : <button className="dash" style={{ marginTop: 9 }} onClick={() => merge({ customOpen: true })}>＋ 직접 입력 · 원하는 답이 없어요</button>}
      <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={nextStep} disabled={state.sel.length === 0 && !state.customText.trim()}>다음 →</button>
      <p className="note" style={{ marginTop: 12 }}>AI가 충분히 좁혔다고 판단하면 자동으로 어휘를 정리해요.</p>
      <button className="link" style={{ marginTop: 8, alignSelf: "center" }} onClick={jumpToTerms}>지금 충분해요 · 어휘 보기 →</button>
    </div></main>
  );
}

function Detail({ t, opening, jumpRelated, doDeepen, toggleKeep }: { t: UITerm; opening: boolean; jumpRelated: (n: string) => void; doDeepen: (id: string) => void; toggleKeep: (id: string) => void }) {
  if (t.detailLoading || !t.detail) return <div className="detail"><div className="dbody"><p style={{ color: "var(--muted)" }}>개념을 불러오는 중…</p></div></div>;
  const d = t.detail;
  const how = t.deepened ? d.how + " (예: 졸작이라면 이 값을 먼저 점검하세요.)" : d.how;
  return (
    <div className={`detail${opening ? " animin" : ""}`}>
      <div className="dsec">개념 · 내 맥락 · 활용</div>
      <div className="dbody">
        <p>{sentLines(d.what)}</p><p>{sentLines(d.whymine)}</p><p>{sentLines(how)}</p>
        {t.context_note && <p><b className="tag-in">내 상황에선 · </b>{sentLines(t.context_note)}</p>}
        {t.direction && <p><b className="tag-in">판단 기준 · </b>{sentLines(t.direction)}</p>}
        {t.use_example && <p><b className="tag-in">예 · </b>{sentLines(t.use_example)}</p>}
        {d.misc && <div className="misc">{sentLines(d.misc)}</div>}
      </div>
      <div className="dsec" style={{ marginTop: 13 }}>함께 볼 어휘 · 출처</div>
      {d.related.length > 0 && <div className="related">{d.related.map((r) => <button key={r} className="relbtn" onClick={() => jumpRelated(r)}>{r} ↗</button>)}</div>}
      {d.sources.length > 0
        ? d.sources.map((s, i) => <a key={i} className="src" href={s.url} target="_blank" rel="noopener noreferrer"><span style={{ color: "var(--faint)", flex: "0 0 auto" }}><LinkIcon /></span><span style={{ flex: 1, minWidth: 0 }}><b>{s.title}</b><small>{s.site}</small></span></a>)
        : <div className="nosrc">확인된 출처 없음 · 일반 지식 기반 설명이에요. 중요한 판단은 메인 AI나 1차 자료로 한 번 더 확인하세요.</div>}
      <button className="deepen" onClick={() => doDeepen(t.id)}>＋ 더 깊이 (예시·비유 추가)</button>
      <button className={`keepbtn big ${t.kept ? "on" : ""}`} onClick={() => toggleKeep(t.id)}>{t.kept ? "담음 ✓ · 모음에서 빼기" : "＋ 이 어휘 담기"}</button>
    </div>
  );
}

function Card({ t, i, state, toggleKeep, toggleDetail, jumpRelated, doDeepen }: { t: UITerm; i: number; state: State; toggleKeep: (id: string) => void; toggleDetail: (id: string) => void; jumpRelated: (n: string) => void; doDeepen: (id: string) => void }) {
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
            {t.kept && <span className="badge-ok">담음 ✓</span>}
          </div>
          <div className="oneline">{sentLines(t.one_line)}</div>
          <div className="why"><b>추천 이유</b><span>{sentLines(t.why)}</span></div>
        </div>
        <span className="chev"><Chev /></span>
      </div>
      {open && <Detail t={t} opening={state.opening === t.id} jumpRelated={jumpRelated} doDeepen={doDeepen} toggleKeep={toggleKeep} />}
      <div className="keeprow">
        <button className={`keepbtn ${t.kept ? "on" : ""}`} onClick={() => toggleKeep(t.id)}>{t.kept ? "담음 ✓" : "＋ 담기"}</button>
      </div>
    </div>
  );
}

function Terms({ state, merge, loadMore, toggleKeep, toggleDetail, jumpRelated, doDeepen, go }: { state: State; merge: (p: Partial<State>) => void; loadMore: () => void; toggleKeep: (id: string) => void; toggleDetail: (id: string) => void; jumpRelated: (n: string) => void; doDeepen: (id: string) => void; go: (s: Screen) => void }) {
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
        <div className="tagrow"><span className="minitag">{state.classifyOut?.domain ?? "분야"}</span><small>추론된 분야</small></div>
        <div className="searchwrap"><SearchIcon /><input className="search" aria-label="이 분야 어휘 검색" placeholder="이 분야 어휘 검색" value={state.query} onChange={(e) => merge({ query: e.target.value })} /></div>
        <div className="progress"><div className="track"><i style={{ width: pct + "%" }} /></div><small>{state.visibleCount}/{total}</small></div>
        <div className="toolrow"><span className="hint"><i />눌러서 개념을 읽고, 쓸 만하면 담아두세요</span><button className={`toggle ${state.groupView ? "on" : ""}`} onClick={() => merge({ groupView: !state.groupView })}>{state.groupView ? "우선순위로" : "그룹으로 보기"}</button></div>
        {state.errorMsg && <div className="taghint" style={{ color: "var(--warn-ink)" }}><span>{state.errorMsg}</span></div>}
        {active.length > 0 ? active.map((t, i) => {
          const head = state.groupView && t.group !== lastG ? <div key={"g" + t.id} className="grouphead"><b>{t.group}</b><i /></div> : null;
          lastG = t.group;
          return <div key={t.id}>{head}<Card t={t} i={i} state={state} toggleKeep={toggleKeep} toggleDetail={toggleDetail} jumpRelated={jumpRelated} doDeepen={doDeepen} /></div>;
        }) : <p className="note" style={{ margin: "24px 0" }}>{state.streaming ? "어휘를 가져오는 중…" : "검색과 일치하는 어휘가 없어요."}</p>}
        {state.moreLoaded
          ? <button className="more done">우선순위 어휘를 모두 봤어요</button>
          : <button className="more" onClick={loadMore}>{state.moreLoading ? "어휘 더 불러오는 중…" : "＋ 어휘 더 보기 (다음 우선순위)"}</button>}
        <p className="note" style={{ marginTop: 13 }}>여기까지가 말그릇 준비예요. 실제 계산, 비교, 시뮬레이션은 메인 AI에서 이어가세요.</p>
      </div></main>
      <div className="foot">
        <div style={{ flex: 1, fontSize: 12.5, color: "var(--muted)" }}>담은 어휘 <b style={{ color: "var(--text)" }}>{keptCount}</b></div>
        <button className="btn-ghost" style={{ width: "auto", padding: "9px 15px", borderRadius: 10, fontSize: 14.5, fontWeight: 600 }} onClick={() => go("kept")} disabled={keptCount === 0}>담은 어휘 보기</button>
      </div>
    </>
  );
}

function Kept({ state, merge, go, goHome, toggleKeep, toggleDetail, jumpRelated, doDeepen, buildSummary, onCopy, onShare, aiRefine }: { state: State; merge: (p: Partial<State>) => void; go: (s: Screen) => void; goHome: () => void; toggleKeep: (id: string) => void; toggleDetail: (id: string) => void; jumpRelated: (n: string) => void; doDeepen: (id: string) => void; buildSummary: (s: State) => string; onCopy: () => void; onShare: () => void; aiRefine: () => void }) {
  const copyLabel = state.copyFailed ? "복사 실패 · 아래 글을 직접 선택해 복사하세요" : state.copied ? "복사됐어요" : "메인 AI용으로 복사";
  const kept = state.terms.filter((t) => t.kept);
  return (
    <main className="scroll"><div className="pad" style={{ display: "flex", flexDirection: "column" }}>
      <button className="link" style={{ alignSelf: "flex-start", color: "var(--muted)", marginBottom: 13 }} onClick={() => (state.histView ? goHome() : go("terms"))}>{state.histView ? "← 처음으로" : "← 어휘로 돌아가기"}</button>
      <h2>담은 어휘{state.input ? ` · ${state.input}` : ""}</h2>
      <p className="lead" style={{ margin: "4px 0 14px" }}>{kept.length ? `${kept.length}개를 담아뒀어요. 펼쳐 보거나 빼낼 수 있어요.` : "아직 담은 어휘가 없어요. 어휘 화면에서 쓸 만한 카드를 담아보세요."}</p>
      {kept.map((t, i) => <Card key={t.id} t={t} i={i} state={state} toggleKeep={toggleKeep} toggleDetail={toggleDetail} jumpRelated={jumpRelated} doDeepen={doDeepen} />)}
      {kept.length > 0 && <>
        <div className="dsec" style={{ marginTop: 16 }}>메인 AI에 붙여넣기 (선택)</div>
        <div className="label" style={{ marginTop: 8 }}>내 상황 한 줄 (선택)</div>
        <input className="field" aria-label="내 상황 한 줄" placeholder="예: 졸업작품 이미지 분류 모델, 검증 점수가 낮아요" value={state.ctxInput} onChange={(e) => merge({ ctxInput: e.target.value })} />
        <div className="summary" style={{ marginTop: 13 }}>{buildSummary(state)}</div>
        {state.aiSummary && <><div className="dsec" style={{ marginTop: 14 }}>AI 추가 정리</div><div className="summary" style={{ marginTop: 6 }}>{state.aiSummary}</div></>}
        <div className="row2">
          <button className="btn btn-ghost" style={{ flex: 2 }} onClick={onCopy}>{copyLabel}</button>
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onShare}>{state.shareNote ? "링크 복사됨" : "공유"}</button>
        </div>
        <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={aiRefine}>{state.aiSummaryLoading ? "AI가 정리하는 중…" : state.plan === "pro" ? "AI로 더 정리" : "AI로 더 정리 (pro 전용 🔒)"}</button>
      </>}
      <button className="link" style={{ alignSelf: "center", color: "var(--muted)", marginTop: 14 }} onClick={goHome}>새로 시작</button>
      <p className="note">AI가 정리한 보조 어휘예요 · 사실 확인은 메인 AI에서</p>
    </div></main>
  );
}

function Paywall({ state, closePaywall, onUpgrade }: { state: State; closePaywall: () => void; onUpgrade: () => void }) {
  return (
    <main className="scroll"><div className="pad" style={{ display: "flex", flexDirection: "column" }}>
      <button className="link" style={{ alignSelf: "flex-start", color: "var(--muted)", marginBottom: 14 }} onClick={closePaywall}>← 닫기</button>
      {state.limitHit && <div className="callout"><b>이번 주 무료 추천을 다 썼어요.</b><p>{sentLines("정식 출시 때 pro로 무제한 이어갈 수 있어요. 무료는 매주 다시 채워져요.")}</p></div>}
      <h2>{state.plan === "pro" ? "pro" : "flash"} 사용 중</h2>
      <p className="lead" style={{ margin: "4px 0 16px" }}>{state.plan === "pro" ? "무제한" : "무료 " + state.remaining + "/7"}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="plancard"><div className="ph"><b>무료 · flash</b><span>₩0</span></div><ul><li>· flash 모델 + RAG</li><li>· 주 7회 추천</li><li>· 상세 개념·출처 열람</li></ul></div>
        <div className="plancard hi"><div className="ribbon">추천</div><div className="ph"><b>유료 · pro</b><span className="hl">월 3,000원대 · 출시 예정</span></div><ul><li>· pro 모델 + RAG</li><li>· 추천 제한 해제</li><li>· AI 추가 정리·더 깊이 우선</li></ul></div>
      </div>
      <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={onUpgrade}>{state.plan === "pro" ? "pro 미리보기 켜짐 ✓" : "pro 미리보기 켜기"}</button>
      <p className="note">아직 정식 출시 전이에요 · 출시되면 알림을 받을 수 있어요</p>
      <div className="legal">{["이용약관", "환불 정책", "개인정보처리방침", "AI 생성 고지", "출처·저작권"].map((l) => <a key={l} href="#">{l}</a>)}</div>
    </div></main>
  );
}

function Refusal({ goHome }: { goHome: () => void }) {
  return (
    <div className="center">
      <div className="mark"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 20, height: 20 }}><path d="M12 8v5M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg></div>
      <h2>이 분야는 도와드리기 어려워요</h2>
      <p className="lead" style={{ margin: 0 }}>{sentLines("의료, 법률처럼 개인의 진단이나 판단이 필요한 고위험 영역은 다루지 않아요. 기술, 창작, 비즈니스 학습 맥락에서 다시 시도해 주세요.")}</p>
      <button className="btn btn-ghost" style={{ width: "auto", padding: "11px 18px" }} onClick={goHome}>다시 입력하기</button>
    </div>
  );
}
