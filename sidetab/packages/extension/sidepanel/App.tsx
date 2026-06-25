// 배경어휘 사이드탭 사이드패널 — panel.html(UI 정본) 5화면을 React로 이식하고 실 API에 배선.
// 디자인/구조는 panel.html을 따른다(theme.css = panel.html style verbatim). mock↔실API는 api.ts가 스위치.
import { useReducer, useRef, useEffect, useCallback, type ReactNode } from "react";
import type {
  Prompt1Out, Choice, Term, Prompt5Out, Tag, RecommendInput,
} from "@sidetab/shared";
import * as api from "./api.js";

// ---------- 타입 ----------
type Screen = "entry" | "narrow" | "terms" | "summary" | "paywall" | "refusal";
type UITag = "know" | "dontknow" | "partial" | "unconfirmed";
interface UITerm extends Term {
  id: string;
  uiTag: UITag;
  understood: boolean;
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
  terms: UITerm[]; visibleCount: number; openId: string | null; opening: string | null;
  query: string; groupView: boolean; trayOpen: boolean;
  moreLoading: boolean; moreLoaded: boolean; tagHintSeen: boolean; streaming: boolean;
  ctxInput: string; copied: boolean; copyFailed: boolean; shareNote: boolean;
  aiSummary: string; aiSummaryLoading: boolean;
  plan: "flash" | "pro"; remaining: number; prevScreen: Screen; limitHit: boolean;
  errorMsg: string;
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
    classifyOut: null, questions: [], answers: [], sel: [], confidence: 0, pending: false,
    terms: [], visibleCount: 0, openId: null, opening: null, query: "", groupView: false, trayOpen: false,
    moreLoading: false, moreLoaded: false, tagHintSeen: false, streaming: false,
    ctxInput: "", copied: false, copyFailed: false, shareNote: false, aiSummary: "", aiSummaryLoading: false,
    plan: "flash", remaining: 5, prevScreen: "entry", limitHit: false, errorMsg: "",
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
const UI_TO_TAG: Record<Exclude<UITag, "unconfirmed">, Tag> = { know: "알아", dontknow: "몰라", partial: "적용모름" };
const INTENT_LABEL = "이 분야를 이해하고 활용";
// 받침 유무로 을/를 조사를 고른다(한글 음절만, 그 외는 를).
function eul(w: string): "을" | "를" {
  const c = w.charCodeAt(w.length - 1);
  if (c < 0xac00 || c > 0xd7a3) return "를";
  return (c - 0xac00) % 28 !== 0 ? "을" : "를";
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
    const next = sel.includes(o) ? sel.filter((x) => x !== o) : sel.length >= 2 ? [sel[1]!, o] : [...sel, o];
    merge({ sel: next });
  };
  const nextStep = useCallback(async () => {
    const s = sref.current;
    if (s.sel.length === 0) return;
    const answers = [...s.answers, s.sel];
    merge({ answers, sel: [], pending: true });
    const history = answers.flat().map((label) => ({ label, action: "선택" as const }));
    try {
      const p2 = await api.nextBranch({ domain: s.classifyOut?.domain ?? "", job_type: s.classifyOut?.job_type ?? [], history });
      const enough = (answers.length >= MIN_Q && p2.enough) || answers.length >= MAX_Q;
      if (enough) { merge({ pending: false, confidence: p2.confidence }); void runRecommend(); return; }
      merge({ pending: false, confidence: p2.confidence, questions: [...s.questions, { question: p2.question, choices: p2.choices }] });
    } catch (e) {
      merge({ pending: false, screen: "terms", errorMsg: msg(e) });
    }
  }, [merge]);
  const undoStep = () => { const s = sref.current; if (s.answers.length) merge({ answers: s.answers.slice(0, -1), sel: [] }); };
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
    merge({ screen: "terms", terms: [], visibleCount: 0, openId: null, streaming: true, errorMsg: "", moreLoaded: false, query: "", remaining: Math.max(0, s.remaining - 1) });
    await api.streamRecommend(buildRecInput(), s.plan === "pro" ? "paid" : "free", (ev) => {
      if (ev.type === "term") {
        const id = "t" + sref.current.terms.length;
        dispatch({ type: "addTerm", term: { ...ev.term, id, uiTag: "unconfirmed", understood: false, deepened: false, _new: true } });
        later(() => dispatch({ type: "updateTerm", id, patch: { _new: false } }), 780);
      } else if (ev.type === "done") merge({ streaming: false });
      else if (ev.type === "error") merge({ streaming: false, errorMsg: ev.message, ...(ev.code === "HIGH_RISK_REFUSED" ? { screen: "refusal" } : {}) });
    }, ctrl.signal).catch((e) => { if ((e as Error).name !== "AbortError") merge({ streaming: false, errorMsg: msg(e) }); });
  }, [merge]);

  const loadMore = useCallback(async () => {
    const s = sref.current;
    if (s.moreLoaded || s.moreLoading) return;
    merge({ moreLoading: true });
    const exclude = s.terms.map((t) => t.term);
    let got = 0;
    const ctrl = new AbortController();
    await api.streamRecommend(buildRecInput(exclude), s.plan === "pro" ? "paid" : "free", (ev) => {
      if (ev.type === "term") {
        // 카드 번호는 기존 개수에 이어서 매긴다(더보기 시 1부터 재시작 버그 수정).
        got++; const n = sref.current.terms.length; const id = "m" + n;
        dispatch({ type: "addTerm", term: { ...ev.term, priority: n + 1, id, uiTag: "unconfirmed", understood: false, deepened: false, _new: true } });
        later(() => dispatch({ type: "updateTerm", id, patch: { _new: false } }), 780);
      }
    }, ctrl.signal).catch(() => {});
    merge({ moreLoading: false, moreLoaded: got === 0 });
  }, [merge]);

  // ----- 태깅/상세 -----
  const setTag = (id: string, tag: UITag) => {
    const t = sref.current.terms.find((x) => x.id === id); if (!t) return;
    dispatch({ type: "updateTerm", id, patch: { uiTag: t.uiTag === tag ? "unconfirmed" : tag } });
    if (!sref.current.tagHintSeen) merge({ tagHintSeen: true });
  };
  const markUnderstood = (id: string) => dispatch({ type: "updateTerm", id, patch: { understood: true, uiTag: "unconfirmed" } });
  const restore = (id: string) => dispatch({ type: "updateTerm", id, patch: { uiTag: "unconfirmed" } });
  const toggleDetail = useCallback(async (id: string) => {
    const s = sref.current;
    if (s.openId === id) { merge({ openId: null }); return; }
    merge({ openId: id, opening: id });
    later(() => { if (sref.current.opening === id) merge({ opening: null }); }, 340);
    const t = s.terms.find((x) => x.id === id);
    if (t && !t.detail && !t.detailLoading) {
      dispatch({ type: "updateTerm", id, patch: { detailLoading: true } });
      try {
        const d = await api.detail({ term: t.term, kind: t.kind, area: s.classifyOut?.domain ?? "", job_type: s.classifyOut?.job_type ?? [], domain: s.classifyOut?.domain ?? "other", topic: s.input, locale: s.classifyOut?.search_locale ?? "en" });
        dispatch({ type: "updateTerm", id, patch: { detail: d, detailLoading: false } });
      } catch { dispatch({ type: "updateTerm", id, patch: { detailLoading: false } }); }
    }
  }, [merge]);
  const jumpRelated = (name: string) => { const t = sref.current.terms.find((x) => x.term === name); if (t) void toggleDetail(t.id); };
  const doDeepen = (id: string) => dispatch({ type: "updateTerm", id, patch: { deepened: true } });

  // ----- 요약 -----
  const buildSummary = (s: State): string => {
    const rv = s.terms.slice(0, s.visibleCount);
    const dont = rv.filter((t) => t.uiTag !== "know" && !t.understood && t.uiTag !== "partial").map((t) => t.term);
    const part = rv.filter((t) => t.uiTag === "partial" && !t.understood).map((t) => t.term);
    const und = rv.filter((t) => t.understood).map((t) => t.term);
    const all = rv.map((t) => t.term);
    const cond = (s.ctxInput || s.cond || "").trim(); const ctxObj = s.input.trim();
    const area = s.classifyOut?.domain ?? "이 분야";
    const L = [`나는 ${area} 영역에서 ${INTENT_LABEL}${eul(INTENT_LABEL)} 하려 한다.`];
    if (cond) L.push(`(내 상황: ${cond})`);
    if (all.length) { let line = "핵심어 " + all.join("·"); line += dont.length ? ` 중 ${dont.join("·")}는 아직 잘 모른다.` : "를 짚었다."; L.push(line); }
    else L.push("(어휘 화면에서 모르는 것을 남겨두면 여기 정리돼요)");
    if (part.length) L.push(part.join("·") + "는 뜻은 알지만 적용이 막막하다.");
    if (und.length) L.push(und.join("·") + "는 이해했다.");
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
    if (s.plan !== "pro") { merge({ prevScreen: "summary", screen: "paywall", limitHit: false }); return; }
    merge({ aiSummaryLoading: true });
    const vocab = s.terms.slice(0, s.visibleCount).map((t) => ({ term: t.term, tag: t.uiTag === "unconfirmed" ? ("몰라" as Tag) : UI_TO_TAG[t.uiTag] }));
    try {
      const r = await api.summarize({ area: s.classifyOut?.domain ?? "", job_type: s.classifyOut?.job_type ?? [], vocab, ...(s.ctxInput ? { user_condition: s.ctxInput } : {}) }, "paid");
      merge({ aiSummary: r.paste_text, aiSummaryLoading: false });
    } catch (e) { merge({ aiSummaryLoading: false, errorMsg: msg(e) }); }
  }, [merge]);

  const openPaywall = () => merge({ prevScreen: sref.current.screen, screen: "paywall", limitHit: false });
  const closePaywall = () => merge({ screen: sref.current.prevScreen === "paywall" ? "entry" : sref.current.prevScreen });
  const onUpgrade = () => { merge({ plan: "pro", remaining: 99 }); later(closePaywall, 350); };

  useEffect(() => () => abortRef.current?.abort(), []);

  const live = state.screen === "narrow";
  return (
    <div id="app" className={live ? "live" : ""} role="application" aria-label="배경어휘 사이드탭">
      {state.pending && <div className="bar" role="status" aria-label="불러오는 중이에요"><i /></div>}
      <Header state={state} openPaywall={openPaywall} goHome={goHome} />
      {state.screen === "entry" && <Entry state={state} merge={merge} submitEntry={submitEntry} chip={chip} />}
      {state.screen === "narrow" && <Narrow state={state} toggleSel={toggleSel} nextStep={nextStep} undoStep={undoStep} jumpToTerms={jumpToTerms} />}
      {state.screen === "terms" && <Terms state={state} merge={merge} loadMore={loadMore} setTag={setTag} markUnderstood={markUnderstood} restore={restore} toggleDetail={toggleDetail} jumpRelated={jumpRelated} doDeepen={doDeepen} go={go} />}
      {state.screen === "summary" && <Summary state={state} merge={merge} go={go} goHome={goHome} buildSummary={buildSummary} onCopy={onCopy} onShare={onShare} aiRefine={aiRefine} />}
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

function Entry({ state, merge, submitEntry, chip }: { state: State; merge: (p: Partial<State>) => void; submitEntry: () => void; chip: (t: string) => void }) {
  const taRef = useRef<HTMLTextAreaElement>(null);
  const grow = () => { const el = taRef.current; if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 160) + "px"; } };
  useEffect(grow, []);
  const list = state.allChips ? CHIPS : SUGGEST;
  return (
    <main className="scroll entryMain">
      <div className="hero">
        <h1 className="heroTitle">무슨 일 때문에 왔나요?</h1>
        <p className="heroSub">그 분야 핵심 어휘를 옆에 사전처럼 띄워둘게요. 막힌 용어나 문서를 붙여넣어도 돼요.</p>
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
      </div>
      <p className="note entryNote">AI가 만든 결과예요 · 의료, 법률처럼 개인 판단이 필요한 고위험 분야는 다루지 않아요</p>
    </main>
  );
}

function Narrow({ state, toggleSel, nextStep, undoStep, jumpToTerms }: { state: State; toggleSel: (o: string) => void; nextStep: () => void; undoStep: () => void; jumpToTerms: () => void }) {
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
      <h2>{cur?.question ?? ""}</h2>
      <p className="lead" style={{ margin: "6px 0 16px" }}>가까운 걸 고르세요 · 두 개까지 가능</p>
      {(cur?.choices ?? []).map((o) => {
        const on = state.sel.includes(o.label);
        return <button key={o.label} className={`opt ${on ? "sel" : ""}`} onClick={() => toggleSel(o.label)}><span>{o.label}</span><span className="tick">✓</span></button>;
      })}
      <button className="btn btn-primary" style={{ marginTop: 18 }} onClick={nextStep} disabled={state.sel.length === 0}>다음 →</button>
      <p className="note" style={{ marginTop: 12 }}>AI가 충분히 좁혔다고 판단하면 자동으로 어휘를 정리해요.</p>
      <button className="link" style={{ marginTop: 8, alignSelf: "center" }} onClick={jumpToTerms}>지금 충분해요 · 어휘 보기 →</button>
    </div></main>
  );
}

function Detail({ t, opening, jumpRelated, doDeepen, markUnderstood }: { t: UITerm; opening: boolean; jumpRelated: (n: string) => void; doDeepen: (id: string) => void; markUnderstood: (id: string) => void }) {
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
      {!t.understood && <button className="understood" onClick={() => markUnderstood(t.id)}>읽었어요 · 이제 알겠다</button>}
    </div>
  );
}

function Card({ t, i, state, setTag, markUnderstood, toggleDetail, jumpRelated, doDeepen }: { t: UITerm; i: number; state: State; setTag: (id: string, tag: UITag) => void; markUnderstood: (id: string) => void; toggleDetail: (id: string) => void; jumpRelated: (n: string) => void; doDeepen: (id: string) => void }) {
  const open = state.openId === t.id;
  const tagCls = (k: UITag) => "tagbtn" + (t.uiTag === k ? (k === "know" ? " on-know" : k === "dontknow" ? " on-dont" : " on-part") : "");
  const animStyle = t._new ? { animation: `cardIn .42s ease both`, animationDelay: `${i * 55}ms` } : undefined;
  return (
    <div className={`card ${open ? "open" : ""}`} style={animStyle}>
      <div className="crow" onClick={() => toggleDetail(t.id)} role="button" aria-expanded={open} tabIndex={0}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleDetail(t.id); } }}>
        <span className="pri">{t.priority}</span>
        <div className="cbody">
          <div className="ctitle">
            <span className="term">{t.term}</span>
            <span className="kind" style={{ background: "var(--surface-2)", color: "var(--muted)" }}>{t.kind}</span>
            {state.groupView && t.group && <span className="gchip">{t.group}</span>}
            {t.understood && <span className="badge-ok">이해함 ✓</span>}
          </div>
          <div className="oneline">{t.one_line}</div>
          <div className="why"><b>추천 이유</b><span>{t.why}</span></div>
        </div>
        <span className="chev"><Chev /></span>
      </div>
      {t.uiTag === "dontknow" && !t.understood && <div className="dontknow"><span>카드를 펼쳐 개념을 읽고, 이해되면 표시해 주세요.</span><button onClick={() => markUnderstood(t.id)}>이제 알겠다</button></div>}
      {open && <Detail t={t} opening={state.opening === t.id} jumpRelated={jumpRelated} doDeepen={doDeepen} markUnderstood={markUnderstood} />}
      <div className="tags">
        <button className={tagCls("know")} onClick={() => setTag(t.id, "know")}>알아</button>
        <button className={tagCls("dontknow")} onClick={() => setTag(t.id, "dontknow")}>몰라</button>
        <button className={tagCls("partial")} onClick={() => setTag(t.id, "partial")}>적용 모름</button>
      </div>
    </div>
  );
}

function Terms({ state, merge, loadMore, setTag, markUnderstood, restore, toggleDetail, jumpRelated, doDeepen, go }: { state: State; merge: (p: Partial<State>) => void; loadMore: () => void; setTag: (id: string, tag: UITag) => void; markUnderstood: (id: string) => void; restore: (id: string) => void; toggleDetail: (id: string) => void; jumpRelated: (n: string) => void; doDeepen: (id: string) => void; go: (s: Screen) => void }) {
  const revealed = state.terms.slice(0, state.visibleCount);
  const known = revealed.filter((t) => t.uiTag === "know");
  let active = revealed.filter((t) => t.uiTag !== "know");
  const q = state.query.trim().toLowerCase();
  if (q) active = active.filter((t) => (t.term + " " + t.one_line).toLowerCase().includes(q));
  if (state.groupView) active = [...active].sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.priority - b.priority);
  const total = state.terms.length || 6;
  const pct = Math.round((state.visibleCount / Math.max(1, total)) * 100);
  const keep = active.filter((t) => !t.understood).length;
  const und = revealed.filter((t) => t.understood).length;
  let lastG: string | undefined;
  return (
    <>
      <main className="scroll"><div style={{ padding: "13px 13px 14px" }}>
        <div className="tagrow"><span className="minitag">{state.classifyOut?.domain ?? "분야"}</span><small>추론된 분야</small></div>
        <div className="searchwrap"><SearchIcon /><input className="search" aria-label="이 분야 어휘 검색" placeholder="이 분야 어휘 검색" value={state.query} onChange={(e) => merge({ query: e.target.value })} /></div>
        <div className="progress"><div className="track"><i style={{ width: pct + "%" }} /></div><small>{state.visibleCount}/{total}</small></div>
        <div className="toolrow"><span className="hint"><i />눌러서 개념을 직접 읽어보세요</span><button className={`toggle ${state.groupView ? "on" : ""}`} onClick={() => merge({ groupView: !state.groupView })}>{state.groupView ? "우선순위로" : "그룹으로 보기"}</button></div>
        {!state.tagHintSeen && state.visibleCount > 0 && <div className="taghint"><span><b>알아</b>는 숨김 · <b>몰라</b>는 강조 · <b>적용 모름</b>은 뜻은 알지만 쓸 줄 모를 때</span><button onClick={() => merge({ tagHintSeen: true })}>확인</button></div>}
        {state.errorMsg && <div className="taghint" style={{ color: "var(--warn-ink)" }}><span>{state.errorMsg}</span></div>}
        {active.length > 0 ? active.map((t, i) => {
          const head = state.groupView && t.group !== lastG ? <div key={"g" + t.id} className="grouphead"><b>{t.group}</b><i /></div> : null;
          lastG = t.group;
          return <div key={t.id}>{head}<Card t={t} i={i} state={state} setTag={setTag} markUnderstood={markUnderstood} toggleDetail={toggleDetail} jumpRelated={jumpRelated} doDeepen={doDeepen} /></div>;
        }) : <p className="note" style={{ margin: "24px 0" }}>{state.streaming ? "어휘를 가져오는 중…" : "검색과 일치하는 어휘가 없어요."}</p>}
        {known.length > 0 && <><button className="tray" onClick={() => merge({ trayOpen: !state.trayOpen })}>아는 어휘 {known.length}개 접음 <span style={{ opacity: .7 }}>{state.trayOpen ? "▴" : "▾"}</span></button>{state.trayOpen && <div className="traychips">{known.map((t) => <button key={t.id} className="traychip" onClick={() => restore(t.id)}><s>{t.term}</s> ↺</button>)}</div>}</>}
        {state.moreLoaded
          ? <button className="more done">우선순위 어휘를 모두 봤어요</button>
          : <button className="more" onClick={loadMore}>{state.moreLoading ? "어휘 더 불러오는 중…" : "＋ 어휘 더 보기 (다음 우선순위)"}</button>}
        <p className="note" style={{ marginTop: 13 }}>여기까지가 말그릇 준비예요. 실제 계산, 비교, 시뮬레이션은 메인 AI에서 이어가세요.</p>
      </div></main>
      <div className="foot">
        <div style={{ flex: 1, fontSize: 12.5, color: "var(--muted)" }}>담은 어휘 <b style={{ color: "var(--text)" }}>{keep}</b> · 이해 <b style={{ color: "var(--text)" }}>{und}</b></div>
        <button className="btn-ghost" style={{ width: "auto", padding: "9px 15px", borderRadius: 10, fontSize: 14.5, fontWeight: 600 }} onClick={() => go("summary")}>정리 보기</button>
      </div>
    </>
  );
}

function Summary({ state, merge, go, goHome, buildSummary, onCopy, onShare, aiRefine }: { state: State; merge: (p: Partial<State>) => void; go: (s: Screen) => void; goHome: () => void; buildSummary: (s: State) => string; onCopy: () => void; onShare: () => void; aiRefine: () => void }) {
  const copyLabel = state.copyFailed ? "복사 실패 · 아래 글을 직접 선택해 복사하세요" : state.copied ? "복사됐어요" : "복사하기";
  return (
    <main className="scroll"><div className="pad" style={{ display: "flex", flexDirection: "column" }}>
      <button className="link" style={{ alignSelf: "flex-start", color: "var(--muted)", marginBottom: 13 }} onClick={() => go("terms")}>← 어휘로 돌아가기</button>
      <h2>오늘의 어휘 정리</h2>
      <div className="callout" style={{ marginTop: 10 }}><b>이미 개념을 쥐었다면 직접 물어보셔도 돼요.</b><p>원하면 아래 정리를 가져가 쓰시는 AI 챗봇에 붙여넣어도 돼요. (선택)</p></div>
      <div className="label">내 상황 한 줄 (선택)</div>
      <input className="field" aria-label="내 상황 한 줄" placeholder="예: 졸업작품 이미지 분류 모델, 검증 점수가 낮아요" value={state.ctxInput} onChange={(e) => merge({ ctxInput: e.target.value })} />
      <div className="summary" style={{ marginTop: 13 }}>{buildSummary(state)}</div>
      {state.aiSummary && <><div className="dsec" style={{ marginTop: 14 }}>AI 추가 정리</div><div className="summary" style={{ marginTop: 6 }}>{state.aiSummary}</div></>}
      <div className="row2">
        <button className="btn btn-ghost" style={{ flex: 2 }} onClick={onCopy}>{copyLabel}</button>
        <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onShare}>{state.shareNote ? "링크 복사됨" : "공유"}</button>
      </div>
      <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={aiRefine}>{state.aiSummaryLoading ? "AI가 정리하는 중…" : state.plan === "pro" ? "AI로 더 정리" : "AI로 더 정리 (pro 전용 🔒)"}</button>
      <button className="link" style={{ alignSelf: "center", color: "var(--muted)", marginTop: 10 }} onClick={goHome}>새로 시작</button>
      <p className="note">AI가 정리한 보조 어휘예요 · 사실 확인은 메인 AI에서</p>
    </div></main>
  );
}

function Paywall({ state, closePaywall, onUpgrade }: { state: State; closePaywall: () => void; onUpgrade: () => void }) {
  return (
    <main className="scroll"><div className="pad" style={{ display: "flex", flexDirection: "column" }}>
      <button className="link" style={{ alignSelf: "flex-start", color: "var(--muted)", marginBottom: 14 }} onClick={closePaywall}>← 닫기</button>
      {state.limitHit && <div className="callout"><b>이번 주 무료 추천을 다 썼어요.</b><p>정식 출시 때 pro로 무제한 이어갈 수 있어요. 무료는 매주 다시 채워져요.</p></div>}
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
      <p className="lead" style={{ margin: 0 }}>의료, 법률처럼 개인의 진단이나 판단이 필요한 고위험 영역은 다루지 않아요. 기술, 창작, 비즈니스 학습 맥락에서 다시 시도해 주세요.</p>
      <button className="btn btn-ghost" style={{ width: "auto", padding: "11px 18px" }} onClick={goHome}>다시 입력하기</button>
    </div>
  );
}
