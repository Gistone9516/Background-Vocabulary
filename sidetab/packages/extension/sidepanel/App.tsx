// 배경노트(Vock note) 사이드패널 — panel.html(UI 정본) 화면을 React로 이식하고 실 API에 배선.
// UI 문자열은 i18n.ts의 t()(여기선 tr)로 가져온다. LLM 콘텐츠는 워커가 출력 언어로 만든다(별개).
import { useReducer, useRef, useEffect, useState, useCallback, useMemo } from "react";
import type { Tag, RecommendInput, OutputLocale, PreviewOut, ClientLimits } from "@sidetab/shared";
import * as api from "./api.js";
import { DEFAULT_CLIENT_LIMITS } from "./api.js";
import * as auth from "./auth.js";
import { loadSessions, saveSession, deleteSession, loadProjects, createProject, deleteProject, type SessionRec, type KeptTerm, type NarrowSnap } from "./history.js";
import { t as tr, LOCALE_LABELS } from "./i18n.js";
import { EXAMPLES, pickRandom } from "./examples.js";
import { MIN_Q, THINK_KEYS, HIGHRISK, GALAXY_POS, RELATE_MIN_KEPT, RELATE_KEPT_CAP } from "./constants.js";
import type { Screen, UITerm, State, Action, Difficulty } from "./types.js";
import { sentLines, splitSentences, firstSentence, fmtDate, dateBucket, markTerms, commaLines, hasVal } from "./text.js";
import { isTextFile, readTextFile } from "./file.js";
import { Spark, Chev, LinkIcon, RefreshIcon, LockIcon, TrashIcon, BookmarkIcon, UserIcon, CopyIcon, ShareIcon, InfoIcon, ListIcon, FolderIcon } from "./icons.js";

// 플랜은 로그인 후 서버가 JWT 로 판정한 tier 에서 온다(auth.getPlan, 마운트 effect 가 pro 면 덮어쓴다).
// 단 테스트 단계 동안에는 하단 테스트 버튼이 켠 sidetab:testpro 플래그로 pro 를 복원한다(출시 전 제거).
function savedPlan(): "flash" | "pro" {
  try { return localStorage.getItem("sidetab:testpro") === "1" ? "pro" : "flash"; } catch { return "flash"; }
}
// 복습 알림 설정. 기본은 켜짐이고 사용자가 끄면 "off"를 저장한다(설정에서 토글).
function savedReview(): boolean {
  try { return localStorage.getItem("sidetab:review") !== "off"; } catch { return true; }
}
// 출력/UI 언어도 새로고침과 홈 복귀(reset)에 유지한다. 저장값 우선, 없으면 브라우저 감지. plan과 같은 복원 패턴이다.
// 이게 없으면 reset이 locale을 한국어로 되돌려, 다른 언어로 보던 중 홈으로 가면 한국어로 휙 바뀐다.
function savedLocale(): OutputLocale {
  try { const st = localStorage.getItem("sidetab:locale"); if (st && (["ko", "en", "ja", "zh"] as string[]).includes(st)) return st as OutputLocale; } catch { /* 무시 */ }
  return api.detectLocale();
}
// 난이도 예시 캐시(localStorage). 같은 세션·같은 답변이면 새로고침·재진입에도 재생성하지 않고 이전 텍스트를 그대로 보여준다.
function savedPreview(): { sid: string; key: string; preview: PreviewOut } | null {
  try { const v = localStorage.getItem("sidetab:preview"); return v ? (JSON.parse(v) as { sid: string; key: string; preview: PreviewOut }) : null; } catch { return null; }
}
function persistPreview(sid: string, key: string, preview: PreviewOut): void {
  try { localStorage.setItem("sidetab:preview", JSON.stringify({ sid, key, preview })); } catch { /* 무시 */ }
}
// 아키네이터 턴 예산은 세션별이다(공유 localStorage 폐기). 새 탐색은 만충으로 시작하고,
// 이어서 진행은 세션 스냅샷(narrow.turnsLeft)에서 복원한다. 매 턴 차감은 saveSession이 세션에 영속한다.
function defaultTurns(plan: "flash" | "pro"): number {
  return plan === "pro" ? DEFAULT_CLIENT_LIMITS.narrowMax.paid : DEFAULT_CLIENT_LIMITS.narrowMax.free;
}
// classify가 주간 한도 초과(429 WEEKLY_LIMIT_EXCEEDED)로 던진 에러인지. 그렇다면 새 탐색을 막고 안내한다.
function weeklyErr(e: unknown): boolean {
  const status = (e as { status?: number })?.status;
  if (status !== 429) return false;
  return (e instanceof Error ? e.message : "").includes("WEEKLY_LIMIT_EXCEEDED");
}
// "선택지 어려워요"의 내부 표식. answers에 넣어 턴만 진행시키고, 모델에 보내는 히스토리에선 걸러낸다.
// 라벨 텍스트("선택지 내용이 어려워요")를 직접 넣으면 모델이 그 신호를 "둘 다 어려움" 같은 메타 선택지로 되받아치므로 sentinel을 쓴다.
const TOO_HARD_MARK = "__too_hard__";
// 좁히기 잔여 턴은 현재 plan과 누적 답변에서 유도한다. 스냅샷의 turnsLeft는 저장 당시 plan 기준이라
// 진행 중 plan이 바뀌면(특히 flash에서 pro로) 어긋난다. 이 함수로 다시 계산하면 항상 현재 plan을 반영한다.
// 어려워요 답변은 난이도 신호일 뿐 예산을 깎지 않으므로 소비 집계에서 뺀다.
function remainingTurns(plan: "flash" | "pro", answers: string[][], limits: ClientLimits): number {
  const max = plan === "pro" ? limits.narrowMax.paid : limits.narrowMax.free;
  const consumed = answers.filter((a) => !(Array.isArray(a) && a.length === 1 && a[0] === TOO_HARD_MARK)).length;
  return Math.max(0, max - consumed);
}
// 받은 선택지에서 금지된 umbrella(둘 다·모두·both·all)·메타("어려움/모르겠음") 라벨을 한 번 더 걸러내는 안전망.
// 모델이 규칙을 어겨도 화면엔 안 뜨게 한다. 너무 많이 걸러지면(2개 미만) 원본을 유지해 빈 화면을 막는다.
const UMBRELLA_RE = /^(둘\s*다|모두|전부|both|all of the above|either|まとめて|全部|以上すべて|全部都|两者都)$/i;
const META_RE = /(어려움|어려워|모르겠|잘\s*모름|don'?t\s*know|not sure|^skip$|건너뛰)/i;
function cleanChoices<T extends { label?: string }>(choices: T[]): T[] {
  if (!Array.isArray(choices)) return choices;
  const kept = choices.filter((c) => { const l = (c?.label ?? "").trim(); return l !== "" && !UMBRELLA_RE.test(l) && !META_RE.test(l); });
  return kept.length >= 2 ? kept : choices;
}
function initial(): State {
  const plan = savedPlan();
  return {
    screen: "entry", input: "", cond: "", showCond: false, inputErr: false,
    attachedFile: null, dragging: false, attachNote: "",
    chipSeed: 0, tutorialOpen: false,
    classifyOut: null, questions: [], answers: [], sel: [], confidence: 0, pending: false, customText: "", customOpen: false,
    usedUndo: false, tooHard: false, simplify: false, unchosen: [], turnsLeft: defaultTurns(plan),
    terms: [], visibleCount: 0, openId: null, opening: null, query: "", groupView: false, detailCount: 0,
    moreLoading: false, moreLoaded: false, streaming: false, groupGenLoading: "", refining: false,
    ctxInput: "", copied: false, copyFailed: false, shareNote: false, aiSummary: "", aiSummaryLoading: false,
    plan, remaining: plan === "pro" ? 99 : DEFAULT_CLIENT_LIMITS.freeWeeklyLimit, prevScreen: "entry", limitHit: false, reviewOn: savedReview(), errorMsg: "",
    sessionId: "", history: [], histView: false, projects: [], limits: DEFAULT_CLIENT_LIMITS, locale: savedLocale(),
  };
}

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "merge": return { ...s, ...a.patch };
    case "addTerm": return { ...s, terms: [...s.terms, a.term], visibleCount: s.visibleCount + 1 };
    case "insertTermAfter": {
      const i = s.terms.findIndex((t) => t.id === a.afterId);
      const at = i < 0 ? s.terms.length : i + 1;
      return { ...s, terms: [...s.terms.slice(0, at), a.term, ...s.terms.slice(at)], visibleCount: s.visibleCount + 1 };
    }
    case "updateTerm": return { ...s, terms: s.terms.map((t) => (t.id === a.id ? { ...t, ...a.patch } : t)) };
    case "reset": return initial();
  }
}

export function App() {
  const [state, dispatch] = useReducer(reducer, undefined, initial);
  const sref = useRef(state); sref.current = state;
  const abortRef = useRef<AbortController | null>(null);
  const previewAbortRef = useRef<AbortController | null>(null); // 난이도 예시 fetch 취소(race 가드)
  const delTimer = useRef<number | undefined>(undefined); // 이전 탐색 삭제 실행취소 타이머
  const classifyingRef = useRef(false); // startNarrow 연타 가드(이중 finishNarrow·이중 차감 방지)
  const merge = useCallback((patch: Partial<State>) => dispatch({ type: "merge", patch }), []);
  const later = (fn: () => void, ms: number) => window.setTimeout(fn, ms);

  // ----- 진입 -----
  const go = (screen: Screen) => merge({ screen });
  // reset 직전 진행 중 스트리밍을 끊고(orphan fetch 방지), reset 뒤 이전 탐색을 다시 읽는다.
  // entry에서 홈으로 복귀하면 screen이 entry 그대로라 로드 effect가 다시 안 돌아 이어서 보기 패널이 사라지던 문제를 막는다.
  const goHome = () => { abortRef.current?.abort(); dispatch({ type: "reset" }); void loadSessions().then((list) => merge({ history: list })); void loadProjects().then((projects) => merge({ projects })); };
  // 확인은 아키네이터(narrow)에서만 — 진행한 턴이 이미 소모됐고 좁히기가 사라짐을 알린다. 그 외 화면은 바로 홈.
  const requestHome = () => {
    if (sref.current.screen === "narrow") { merge({ confirmHome: true }); return; }
    goHome();
  };
  const confirmHomeYes = () => { merge({ confirmHome: false }); goHome(); };
  // 이전 탐색 삭제: 즉시 지우되 잠깐 "실행취소"를 띄운다(무확인·무복구 제거, c-1-4).
  const deleteHistory = (id: string) => {
    const rec = sref.current.history.find((h) => h.id === id);
    if (!rec) return;
    void deleteSession(id).then((list) => merge({ history: list, pendingDel: rec }));
    window.clearTimeout(delTimer.current);
    delTimer.current = window.setTimeout(() => merge({ pendingDel: null }), 5000);
  };
  const undoDelete = () => {
    const rec = sref.current.pendingDel; if (!rec) return;
    window.clearTimeout(delTimer.current);
    void saveSession(rec).then((list) => merge({ history: list, pendingDel: null }));
  };
  // 세션 고정 토글. saveSession upsert로 pinned만 갱신해 목록에 즉시 반영한다. 고정 세션은 CAP 보호 대상이라 오래됐다고 밀리지 않는다.
  const togglePin = (id: string) => {
    const rec = sref.current.history.find((h) => h.id === id);
    if (!rec) return;
    void saveSession({ ...rec, pinned: !rec.pinned }).then((list) => merge({ history: list }));
  };
  // 프로젝트(폴더) 만들기·지우기·세션 배정. 전부 chrome.storage.local, 서버 무관.
  const addProject = (name: string) => { if (!name.trim()) return; void createProject(name).then((projects) => merge({ projects })); };
  const removeProject = (id: string) => { void deleteProject(id).then(({ projects, sessions }) => merge({ projects, history: sessions, activeProject: undefined })); };
  // 세션을 프로젝트에 넣거나 뺀다(미분류 세션 재배정용). projectId=undefined면 미분류로.
  const assignProject = (id: string, projectId: string | undefined) => {
    const rec = sref.current.history.find((h) => h.id === id);
    if (!rec) return;
    void saveSession({ ...rec, projectId }).then((list) => merge({ history: list }));
  };

  // 진행 중 좁히기 스냅샷을 세션에 upsert한다(기존 createdAt·담은 어휘는 보존, updatedAt 갱신).
  // 이걸로 이탈·새로고침·크래시에도 좁히기를 이어서 진행할 수 있다. refine(비영속)은 호출하지 않는다.
  const writeNarrowSession = useCallback((sid: string, snap: NarrowSnap, topic: string, area: string, locale: string) => {
    const existing = sref.current.history.find((h) => h.id === sid);
    // 이어서 연 기존 세션은 소속(projectId)을 바꾸지 않는다. 새로 시작한 세션만 현재 스코프 프로젝트에 편입한다.
    const projectId = existing ? existing.projectId : sref.current.activeProject;
    const rec: SessionRec = { id: sid, topic, area, locale, createdAt: existing?.createdAt ?? Date.now(), updatedAt: Date.now(), terms: existing?.terms ?? [], narrow: snap, ...(projectId ? { projectId } : {}), ...(existing?.pinned ? { pinned: existing.pinned } : {}), ...(snap.classifyOut.job_type?.length ? { job_type: snap.classifyOut.job_type } : {}), ...(snap.classifyOut.domain_risk ? { domain_risk: snap.classifyOut.domain_risk } : {}) };
    void saveSession(rec).then((list) => merge({ history: list }));
  }, [merge]);

  const startNarrow = useCallback(async (raw: string) => {
    if (classifyingRef.current) return; // 연타 드롭: 이미 분류 중이면 무시(이중 진입 방지)
    classifyingRef.current = true;
    merge({ pending: true, screen: "narrow", answers: [], sel: [], questions: [], input: raw, refining: false, usedUndo: false, tooHard: false, simplify: false, resumedSession: false, relateOut: null, relateCond: "" });
    try {
      const cond0 = sref.current.cond.trim();
      const projName = projectName(); // 프로젝트 제목을 첫 질문부터 부드러운 사전으로
      const p1 = await api.classify({ raw_input: raw, ...(sref.current.attachedFile ? { context_object: sref.current.attachedFile.text } : {}), ...(cond0 ? { user_condition: cond0 } : {}), ...(projName ? { project_context: projName } : {}) }, sref.current.plan === "pro" ? "paid" : "free");
      if (p1.domain_risk === "high") { merge({ pending: false, screen: "refusal" }); return; } // 고위험: 세션·과금 없음
      // 정상 분류 = 세션 생성. classify가 곧 결제(D3)이므로 주간 1회 차감(클라 추정), 턴 예산 만충, narrow 첫 스냅샷 저장(0답도 저장).
      const tier = sref.current.plan === "pro" ? "paid" : "free";
      const full = sref.current.limits.narrowMax[tier];
      const sid = crypto.randomUUID();
      const badQ = typeof p1.question !== "string" || !Array.isArray(p1.choices) || p1.choices.length === 0;
      const firstQ = badQ ? [] : [{ question: p1.question, choices: cleanChoices(p1.choices) }];
      merge({ pending: false, classifyOut: p1, questions: firstQ, sessionId: sid, turnsLeft: full, ...(sref.current.plan !== "pro" ? { remaining: Math.max(0, sref.current.remaining - 1) } : {}) });
      writeNarrowSession(sid, { classifyOut: p1, questions: firstQ, answers: [], unchosen: [], usedUndo: false, tooHard: false, simplify: false, refining: false, confidence: 0, turnsLeft: full, ...(cond0 ? { cond: cond0 } : {}) }, raw, p1.domain ?? "", p1.search_locale ?? "en");
      if (badQ) finishNarrow(false); // 분류 형태가 깨지면 좁히기 건너뛰고 바로 추천(렌더 throw 방지)
    } catch (e) {
      if (weeklyErr(e)) { merge({ pending: false, screen: "entry", remaining: 0, proNotice: "weekly" }); return; } // 주간 소진: 새 탐색 차단(재개는 가능)
      merge({ pending: false, screen: "terms", errorMsg: msg(e), streaming: false });
    } finally {
      classifyingRef.current = false;
    }
  }, [merge, writeNarrowSession]);

  // 무료에서 주간 추천이 0이면 새 탐색을 시작할 수 없다(classify가 곧 결제). 진입 시 페이월 안내로 보낸다.
  // 진행 중 세션 재개(openHistory)는 이 게이트를 거치지 않아 영향 없다(재과금 없음).
  const cannotStartNew = () => { const s = sref.current; return s.plan === "flash" && s.remaining <= 0; };
  const submitEntry = () => {
    const v = sref.current.input.trim();
    if (!v) { merge({ inputErr: true }); later(() => merge({ inputErr: false }), 2400); return; }
    if (HIGHRISK.test(v)) { go("refusal"); return; }
    if (cannotStartNew()) { openPaywall(); return; }
    void startNarrow(v);
  };
  // 예시 칩 클릭은 입력창에 텍스트를 넣기만 한다. 바로 좁히기가 시작되면 의도와 다른 조작이 될 수 있어서다. 위험어 차단과 페이월은 사용자가 실제로 제출할 때 submitEntry가 처리한다.
  const chip = (t: string) => merge({ input: t });

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
  // 무료가 잠긴 첨부를 시도하면 페이월로 끌고 가지 않고, 그 자리서 하단 패널로 "pro 기능"임을 알린다.
  const attachNotice = () => merge({ proNotice: "attach", dragging: false });

  // ----- 좁히기 -----
  const toggleSel = (o: string) => {
    const sel = sref.current.sel;
    const next = sel.includes(o) ? sel.filter((x) => x !== o) : [...sel, o];
    merge({ sel: next, tooHard: false }); // 일반 선택을 누르면 "어려워요" 배타 선택은 해제
  };
  // 좁히기 한 턴 진행: 누적 답변으로 nextBranch를 호출해 다음 질문을 받거나, 충분하면 추천으로 넘긴다. nextStep과 조건 재탐색이 공유한다.
  // simplify는 sticky(세션 유지)지만 막 설정한 직후엔 sref가 stale일 수 있어 opts로 명시 전달한다.
  const advanceNarrow = useCallback(async (answers: string[][], opts?: { simplify?: boolean; turnsLeft?: number }) => {
    const s0 = sref.current;
    const sid = s0.sessionId; // 이 좁히기의 세션. 응답 도착 시 reset/다른 세션으로 바뀌었으면 결과를 버린다(orphan·stale 가드).
    const refining = s0.refining; // refine은 비영속이라 narrow를 저장하지 않는다.
    const history = answers.flat().filter((label) => label !== TOO_HARD_MARK).map((label) => ({ label, action: "선택" as const }));
    const simplify = opts?.simplify ?? s0.simplify;
    // 예산은 호출부에서 명시 전달(merge 직후 sref stale 방지). 미전달 시 현재값.
    const turnsLeft = opts?.turnsLeft ?? s0.turnsLeft;
    try {
      const cond0 = s0.cond.trim();
      const projName = projectName(); // 매 좁히기 턴에도 같은 사전 유지
      const p2 = await api.nextBranch({ domain: s0.classifyOut?.domain ?? "", job_type: s0.classifyOut?.job_type ?? [], history, ...(s0.attachedFile ? { context_object: s0.attachedFile.text } : {}), ...(cond0 ? { user_condition: cond0 } : {}), ...(projName ? { project_context: projName } : {}), ...(simplify ? { simplify: true } : {}) });
      if (sref.current.sessionId !== sid) return; // 세션이 바뀜(홈/다른 세션 열기) → 결과 폐기
      const s = sref.current;
      const c = s.classifyOut;
      // 좁히기 최대 턴은 워커 한도(limits.narrowMax)에서 온다. free는 적게, paid는 의중이 갈릴 때만 더.
      const maxQ = s.plan === "pro" ? s.limits.narrowMax.paid : s.limits.narrowMax.free;
      const conf = Number.isFinite(p2.confidence) ? p2.confidence : s.confidence;
      // 종료: 충분(최소 MIN_Q 이상) 또는 절대 상한 또는 예산 소진(단 0답 생성 금지 위해 answers>=1 전제).
      const enough = (answers.length >= MIN_Q && p2.enough) || answers.length >= maxQ || (answers.length >= 1 && turnsLeft <= 0);
      // 다음 질문이 비정상이면(off-topic 등으로 형태가 깨짐) 좁히기를 종료하고 추천으로. 렌더 중 throw로 인한 블랭크 크래시 방지.
      const badNext = typeof p2.question !== "string" || !Array.isArray(p2.choices) || p2.choices.length === 0;
      if (enough || badNext) {
        merge({ pending: false, confidence: conf });
        // 생성 직전 최종 스냅샷 저장(생성 중 크래시·이탈에도 재개 가능). refine은 비영속.
        if (!refining && c && sid) writeNarrowSession(sid, { classifyOut: c, questions: s.questions, answers, unchosen: s.unchosen, usedUndo: s.usedUndo, tooHard: s.tooHard, simplify, refining: false, confidence: conf, turnsLeft, ...(cond0 ? { cond: cond0 } : {}) }, s.input, c.domain ?? "", c.search_locale ?? "en");
        finishNarrow(refining); return;
      }
      const newQuestions = [...s.questions, { question: p2.question, choices: cleanChoices(p2.choices) }];
      merge({ pending: false, confidence: conf, questions: newQuestions });
      // 매 턴 스냅샷 저장(다음 질문이 뜬 "답할 준비" 상태).
      if (!refining && c && sid) writeNarrowSession(sid, { classifyOut: c, questions: newQuestions, answers, unchosen: s.unchosen, usedUndo: s.usedUndo, tooHard: s.tooHard, simplify, refining: false, confidence: conf, turnsLeft, ...(cond0 ? { cond: cond0 } : {}) }, s.input, c.domain ?? "", c.search_locale ?? "en");
    } catch (e) {
      if (sref.current.sessionId !== sid) return;
      merge({ pending: false, screen: "terms", errorMsg: msg(e) });
    }
  }, [merge, writeNarrowSession]);
  const nextStep = useCallback(async () => {
    const s = sref.current;
    // "선택지가 어려워요"를 고른 턴: 마커 한 칸을 답변으로 넣고 이후 난이도를 낮춘다(simplify sticky).
    if (s.tooHard) {
      // "선택지가 어려워요"는 답이 아니라 난이도 신호이므로 턴 예산을 깎지 않는다(turnsLeft 유지).
      const answers = [...s.answers, [TOO_HARD_MARK]]; // 라벨 텍스트가 아니라 sentinel(히스토리에서 걸러짐)
      merge({ answers, sel: [], customText: "", customOpen: false, tooHard: false, simplify: true, pending: true });
      await advanceNarrow(answers, { simplify: true, turnsLeft: s.turnsLeft });
      return;
    }
    const custom = s.customText.trim();
    const picked = custom ? [...s.sel, custom] : s.sel; // 칩 + 직접 입력 합산(둘 다 포함)
    if (picked.length === 0) return;
    const newTurns = Math.max(0, s.turnsLeft - 1);
    const answers = [...s.answers, picked];
    merge({ answers, sel: [], customText: "", customOpen: false, pending: true, turnsLeft: newTurns });
    await advanceNarrow(answers, { turnsLeft: newTurns });
  }, [merge, advanceNarrow]);
  // Terms에서 조건을 입력해 아키네이터로 재진입(다음 질문부터). pro 전용, 무료는 페이월. narrowMax 동일 적용.
  const refineFromTerms = useCallback(async (text: string) => {
    const s = sref.current;
    const t = text.trim();
    if (!t) return;
    if (s.plan !== "pro") { merge({ proNotice: "refine" }); return; } // pro 전용
    // refine은 이전 좁히기를 그대로 이어가는 라이브 연장이다(refining=true는 비영속). 입력 조건을 새 답변 턴으로 더해
    // 다음 질문을 잇고, 끝나면 기존 어휘 리스트에 이어붙인다(append). 화면은 일반 좁히기와 동일하게 둔다(별도 배너 없음).
    const answers = [...s.answers, [t]];
    merge({ answers, sel: [], customText: "", customOpen: false, query: "", screen: "narrow", pending: true, refining: true });
    await advanceNarrow(answers, { turnsLeft: s.turnsLeft });
  }, [merge, advanceNarrow]);
  // 되돌리기는 세션당 1회. 누르면 곧장 1턴(첫 질문)으로 회귀하고 버튼은 비활성된다.
  const undoStep = () => {
    const s = sref.current;
    if (s.usedUndo || s.answers.length === 0) return;
    merge({ answers: [], questions: s.questions.slice(0, 1), sel: [], customText: "", customOpen: false, tooHard: false, confidence: 0, usedUndo: true, refining: false });
  };
  // "여기까지 보기"로 좁히기를 끝내기 직전, 현재 진행을 저장한다(사용자 클릭이라 sref가 최신). refine은 비영속.
  const jumpToTerms = () => {
    const s = sref.current; const c = s.classifyOut;
    if (!s.refining && c && s.sessionId) writeNarrowSession(s.sessionId, { classifyOut: c, questions: s.questions, answers: s.answers, unchosen: s.unchosen, usedUndo: s.usedUndo, tooHard: s.tooHard, simplify: s.simplify, refining: false, confidence: s.confidence, turnsLeft: s.turnsLeft, ...(s.cond.trim() ? { cond: s.cond.trim() } : {}) }, s.input, c.domain ?? "", c.search_locale ?? "en");
    finishNarrow(false);
  };

  // ----- 추천(스트리밍) -----
  // 같은 프로젝트의 다른 세션에서 담은(kept) 어휘를 모은다. 같은 도메인만(가드4, 느슨한 버킷 주제 섞임 차단).
  // 연결 턴 입력과 추천 dedup(메커니즘1)에 함께 쓴다. 프로젝트에 안 속한 세션은 빈 배열.
  const projectKept = (): { term: string; one_line: string; area: string }[] => {
    const s = sref.current;
    const rec = s.history.find((h) => h.id === s.sessionId);
    const pid = rec?.projectId ?? s.activeProject;
    if (!pid) return [];
    const area = s.classifyOut?.domain ?? "";
    const out: { term: string; one_line: string; area: string }[] = [];
    for (const h of s.history) {
      if (h.projectId !== pid || h.id === s.sessionId) continue;
      if (area && h.area && h.area !== area) continue; // 같은 도메인 프리필터
      for (const t of h.terms) out.push({ term: t.term, one_line: t.one_line, area: h.area });
    }
    return out;
  };
  // 현재 세션이 속한 프로젝트(폴더)의 제목. 없으면 빈 문자열. 아키네이터(부드러운 사전)와 상세(약한 반영)에 전달한다.
  const projectName = (): string => {
    const s = sref.current;
    const rec = s.history.find((h) => h.id === s.sessionId);
    const pid = rec?.projectId ?? s.activeProject;
    if (!pid) return "";
    return s.projects.find((p) => p.id === pid)?.name ?? "";
  };
  const buildRecInput = (exclude?: string[], diffOverride?: Difficulty): RecommendInput => {
    const s = sref.current; const c = s.classifyOut;
    // 난이도는 막 고른 직후 sref가 stale일 수 있어, 호출부에서 명시 전달하면 그것을 우선한다.
    const difficulty = diffOverride ?? s.difficulty;
    // dedup(메커니즘1): 같은 프로젝트에서 이미 담은 어휘를 제외 목록에 더한다.
    const keptNames = projectKept().map((k) => k.term);
    const exAll = Array.from(new Set([...(exclude ?? []), ...keptNames]));
    // 프라이밍(메커니즘2): 진입 조건과 연결 턴에서 고른 방향을 합쳐 user_condition으로 보낸다(사용자가 고른 것만).
    const cond = [s.cond.trim(), (s.relateCond ?? "").trim()].filter(Boolean).join(" ");
    return {
      area: c?.domain ?? "", domain: c?.domain ?? "other", topic: s.input,
      locale: c?.search_locale ?? "en", job_type: c?.job_type ?? [], domain_risk: c?.domain_risk ?? "low",
      ...(exAll.length ? { exclude: exAll } : {}),
      ...(s.attachedFile ? { context_object: s.attachedFile.text } : {}),
      ...(cond ? { user_condition: cond } : {}),
      ...(difficulty ? { difficulty } : {}), // 사용자가 고른 난이도(묶음4)
    };
  };
  // 생성이 끝나면(done) 진행 중 세션의 narrow를 제거해 완료로 전이한다. 담은 어휘 0개면 saveSession이 목록에서 제거한다(R1 기본값).
  // done 전 크래시·이탈은 narrow를 보존해 재개 가능(완료 전이는 오직 done에서만 — 담기로는 narrow를 지우지 않는다).
  const completeSession = useCallback(() => {
    const s = sref.current; const sid = s.sessionId;
    if (!sid) return;
    const existing = s.history.find((h) => h.id === sid);
    if (!existing || !existing.narrow) return; // 진행 중(narrow 보유) 세션만 전이
    const toKept = (t: UITerm): KeptTerm => ({ term: t.term, kind: t.kind, one_line: t.one_line, why: t.why, priority: t.priority, ...(t.group ? { group: t.group } : {}), ...(t.detail ? { detail: t.detail } : {}) });
    const generated = s.terms.map(toKept); // 생성한 전체 리스트(0담기여도 되돌아가서 다시 보기용)
    const kept = s.terms.filter((t) => t.kept).map(toKept);
    void saveSession({ ...existing, terms: kept, generated, narrow: undefined, updatedAt: Date.now() }).then((list) => merge({ history: list }));
  }, [merge]);
  const runRecommend = useCallback(async (append = false, diffOverride?: Difficulty) => {
    const s = sref.current;
    const tier = s.plan === "pro" ? "paid" : "free";
    // 주간 차감은 classify(세션 생성)에서 끝났으므로 여기서 remaining으로 막지 않는다(결제한 탐색의 생성은 보장).
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
      }, ctrl.signal).catch((e) => { if ((e as Error).name !== "AbortError") merge({ streaming: false, errorMsg: msg(e) }); })
        .finally(() => { if (sref.current.streaming) merge({ streaming: false }); }); // abort·done 누락에도 스피너 해제(append 경로 영구 로딩 차단)
      return;
    }
    // 새 탐색 생성. sessionId·turnsLeft·remaining은 classify에서 이미 설정됨(여기서 재충전·재과금·sessionId 재발급 없음).
    merge({ screen: "terms", terms: [], visibleCount: 0, openId: null, streaming: true, errorMsg: "", moreLoaded: false, query: "", histView: false, detailCount: 0, refining: false });
    // done/error 없이 스트림이 멈추는 경우(연결 끊김·무한대기)를 대비한 watchdog. 이벤트마다 갱신한다.
    let watchdog = window.setTimeout(() => { ctrl.abort(); merge({ streaming: false }); }, 45000);
    const bump = () => { window.clearTimeout(watchdog); watchdog = window.setTimeout(() => { ctrl.abort(); merge({ streaming: false }); }, 45000); };
    await api.streamRecommend(buildRecInput(undefined, diffOverride), tier, (ev) => {
      bump();
      if (ev.type === "term") {
        const id = "t" + sref.current.terms.length;
        dispatch({ type: "addTerm", term: { ...ev.term, id, kept: false, _new: true } });
        later(() => dispatch({ type: "updateTerm", id, patch: { _new: false } }), 780);
      } else if (ev.type === "done") { merge({ streaming: false }); completeSession(); } // 생성 완료 → narrow 제거(완료 전이)
      else if (ev.type === "error") merge({ streaming: false, errorMsg: ev.message, ...(ev.code === "HIGH_RISK_REFUSED" ? { screen: "refusal" } : {}) });
    }, ctrl.signal)
      .catch((e) => { if ((e as Error).name !== "AbortError") merge({ streaming: false, errorMsg: msg(e) }); })
      .finally(() => { window.clearTimeout(watchdog); if (sref.current.streaming) merge({ streaming: false }); }); // done 없이 끝나도 streaming 해제(narrow는 보존=재개 가능)
  }, [merge, completeSession]);

  // 난이도 화면 진입 시 좁혀진 주제의 깊이별 대표 어휘를 미리 생성한다(한도 미집계). 화면을 떠났거나 새 프리뷰가 시작되면 결과를 버린다(race 가드).
  const startPreview = useCallback(() => {
    const s = sref.current; const c = s.classifyOut;
    if (!c) return;
    const history = s.answers.flat().filter((l) => l !== TOO_HARD_MARK);
    const key = JSON.stringify(history);
    // 같은 세션·같은 답변이면 이전에 생성한 예시를 그대로 재사용(새로고침·재진입 시 재생성 방지).
    const cached = savedPreview();
    if (cached && cached.sid === s.sessionId && cached.key === key) { merge({ previews: cached.preview, previewLoading: false }); return; }
    previewAbortRef.current?.abort();
    const ctrl = new AbortController(); previewAbortRef.current = ctrl;
    const sid = s.sessionId;
    merge({ previews: null, previewLoading: true });
    api.preview({ area: c.domain ?? "", job_type: c.job_type ?? [], history, ...(s.input ? { topic: s.input } : {}) })
      .then((p) => {
        if (ctrl.signal.aborted || sref.current.screen !== "difficulty") return;
        merge({ previews: p, previewLoading: false });
        persistPreview(sid, key, p); // 세션·답변 키로 캐시
      })
      .catch(() => { if (!ctrl.signal.aborted && sref.current.screen === "difficulty") merge({ previewLoading: false }); }); // 폴백: 예시 없이 정적 안내만
  }, [merge]);
  // 좁히기 종료 직전, 같은 프로젝트 kept 어휘가 현재 좁힌 작업과 연결되는지 묻는 "연결 턴"을 조건부로 띄운다.
  // 같은 도메인 kept가 임계 미만이거나 연결이 없으면(relevant=false) 조용히 건너뛰고 난이도로 간다(가드 1·2).
  const maybeRelate = useCallback(async () => {
    const s = sref.current; const c = s.classifyOut;
    const kept = projectKept();
    if (!c || kept.length < RELATE_MIN_KEPT) { merge({ screen: "difficulty", relateOut: null }); startPreview(); return; }
    const sid = s.sessionId;
    merge({ screen: "relate", relateLoading: true, relateOut: null });
    try {
      const history = s.answers.flat().filter((l) => l !== TOO_HARD_MARK);
      const out = await api.relate({ area: c.domain ?? "", job_type: c.job_type ?? [], history, ...(s.input ? { topic: s.input } : {}), kept: kept.slice(0, RELATE_KEPT_CAP) });
      if (sref.current.sessionId !== sid) return; // 세션 바뀜(홈·다른 세션) → 결과 폐기
      if (!out.relevant || !out.choices?.length || !out.question) { merge({ screen: "difficulty", relateLoading: false, relateOut: null }); startPreview(); return; } // 연결 없음 또는 질문 비었음 시 스킵(빈 h2 렌더 방지)
      merge({ relateOut: out, relateLoading: false });
    } catch {
      if (sref.current.sessionId !== sid) return;
      merge({ screen: "difficulty", relateLoading: false, relateOut: null }); startPreview(); // 실패는 그냥 난이도로 degrade(가드)
    }
  }, [merge, startPreview]);
  // 연결 턴에서 한 방향 선택 → 사용자가 고른 연결만 user_condition에 실어 추천을 그 위로 쌓게 한다(조용한 주입 아님).
  const pickRelate = (label: string) => {
    const out = sref.current.relateOut;
    const terms = out?.related_terms ?? [];
    // 프라이밍 문구를 출력 로케일로 만든다(한국어 고정 시 en·ja·zh 추천에 언어 충돌과 품질 저하).
    const cond = tr(sref.current.locale, "relate_cond", { terms: terms.join(", "), label });
    merge({ relateCond: cond, screen: "difficulty", relateOut: null });
    startPreview();
  };
  // "관련 없어요" → 프라이밍 없이 난이도로(dedup만 유지).
  const skipRelate = () => { merge({ relateCond: "", screen: "difficulty", relateOut: null }); startPreview(); };
  // 좁히기를 마치고 어휘로 넘어가기 직전. 초기 생성이면 연결 턴(조건부)을 거쳐 난이도로, 조건 재탐색(append)이나 난이도 기선택이면 바로 잇는다.
  const finishNarrow = (append: boolean) => {
    if (append || sref.current.difficulty) { void runRecommend(append); return; }
    void maybeRelate();
  };
  // 난이도 선택 직후 곧장 생성한다. 프리뷰 fetch는 버리고, merge가 아직 반영 전이라 고른 값을 명시 전달한다(stale 방지).
  const pickDifficulty = (level: Difficulty) => { previewAbortRef.current?.abort(); merge({ difficulty: level }); void runRecommend(false, level); };
  // 난이도 화면 뒤로: 답이 있으면 좁히기로 복귀, 없으면(B0 스킵) 처음으로. 프리뷰 fetch는 버린다.
  const backFromDifficulty = () => {
    previewAbortRef.current?.abort();
    if (sref.current.answers.length > 0) merge({ screen: "narrow", previews: null, previewLoading: false });
    else goHome();
  };

  const loadMore = useCallback(async () => {
    const s = sref.current;
    if (s.moreLoaded || s.moreLoading) return;
    // 더 보기는 유료 전용. 무료는 페이월로 보낸다(추가 추천 호출 절감).
    if (s.plan !== "pro") { merge({ proNotice: "more" }); return; }
    const cap = s.limits.maxTotal.paid;
    if (s.terms.length >= cap) { merge({ moreLoaded: true }); return; } // 누적 상한(maxTotal) 도달
    merge({ moreLoading: true });
    const exclude = s.terms.map((t) => t.term);
    let got = 0; let failed = false;
    const ctrl = new AbortController();
    await api.streamRecommend(buildRecInput(exclude), "paid", (ev) => {
      if (ev.type === "term") {
        if (sref.current.terms.length >= cap) { ctrl.abort(); return; } // 스트리밍 중 누적 상한 재확인(초과 생성 차단)
        // 카드 번호는 기존 개수에 이어서 매긴다(더보기 시 1부터 재시작 버그 수정).
        got++; const n = sref.current.terms.length; const id = "m" + n;
        dispatch({ type: "addTerm", term: { ...ev.term, priority: n + 1, id, kept: false, _new: true } });
        later(() => dispatch({ type: "updateTerm", id, patch: { _new: false } }), 780);
      } else if (ev.type === "error") { failed = true; merge({ errorMsg: ev.message }); }
    }, ctrl.signal).catch((e) => { if ((e as Error).name !== "AbortError") { failed = true; merge({ errorMsg: msg(e) }); } });
    // 실패면 moreLoaded를 세우지 않는다(에러를 "더 없음"으로 오인해 더보기 버튼이 영구 비활성화되던 버그 차단).
    merge({ moreLoading: false, ...(failed ? {} : { moreLoaded: got === 0 }) });
  }, [merge]);

  // 그룹 보기에서 해당 그룹 어휘만 추가 생성한다(무료 2·유료 4 고정). maxTotal 누적 상한을 적용한다.
  const genGroup = useCallback(async (group: string) => {
    const s = sref.current;
    if (s.groupGenLoading) return;
    const tier: "free" | "paid" = s.plan === "pro" ? "paid" : "free";
    const cap = s.limits.maxTotal[tier];
    if (s.terms.length >= cap) { merge({ proNotice: "cap" }); return; }
    merge({ groupGenLoading: group });
    const want = s.limits.groupGen[tier];
    const exclude = s.terms.map((t) => t.term);
    let got = 0;
    const ctrl = new AbortController();
    await api.streamRecommend({ ...buildRecInput(exclude), user_condition: `Only suggest vocabulary that belongs to the group "${group}".${s.cond.trim() ? " " + s.cond.trim() : ""}` }, tier, (ev) => {
      if (ev.type === "term" && got < want) {
        if (sref.current.terms.length >= cap) { ctrl.abort(); return; } // 동시 생성 경로와 합산해 누적 상한 초과 차단
        got++; const n = sref.current.terms.length; const id = "g" + n;
        dispatch({ type: "addTerm", term: { ...ev.term, group, priority: n + 1, id, kept: false, _new: true } });
        later(() => dispatch({ type: "updateTerm", id, patch: { _new: false } }), 780);
        if (got >= want) ctrl.abort();
      } else if (ev.type === "error") merge({ errorMsg: ev.message });
    }, ctrl.signal).catch((e) => { if ((e as Error).name !== "AbortError") merge({ errorMsg: msg(e) }); });
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
      ...(existing ?? {}), // 기존 레코드의 projectId·pinned·job_type·domain_risk·generated·narrow를 보존한다(담기 한 번에 프로젝트 소속·핀이 사라지던 버그 차단)
      id, topic: s.input, area: s.classifyOut?.domain ?? existing?.area ?? "",
      locale: s.classifyOut?.search_locale ?? existing?.locale ?? "en",
      createdAt: existing?.createdAt ?? Date.now(), updatedAt: Date.now(),
      terms: keptTerms,
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
      merge({ proNotice: "detail" });
      return;
    }
    merge({ openId: id, opening: id });
    later(() => { if (sref.current.opening === id) merge({ opening: null }); }, 340);
    if (t && willFetch) {
      dispatch({ type: "updateTerm", id, patch: { detailLoading: true } });
      try {
        // 연결 턴에서 정렬을 확정했을 때만(relateCond 있음) 프로젝트 제목과 아는 어휘를 상세에 약하게 전달한다.
        const rc = (s.relateCond ?? "").trim();
        const pn = projectName();
        const hint = rc ? [pn ? `프로젝트 맥락: ${pn}.` : "", rc].filter(Boolean).join(" ") : "";
        const d = await api.detail({ term: t.term, kind: t.kind, area: s.classifyOut?.domain ?? "", job_type: s.classifyOut?.job_type ?? [], domain: s.classifyOut?.domain ?? "other", topic: s.input, locale: s.classifyOut?.search_locale ?? "en", ...(hint ? { connection_hint: hint } : {}) }, s.plan === "pro" ? "paid" : "free");
        dispatch({ type: "updateTerm", id, patch: { detail: d, detailLoading: false } });
        if (s.plan !== "pro") merge({ detailCount: sref.current.detailCount + 1 }); // 성공한 열람만 무료 횟수 차감(실패 시 차감하지 않는다)
        const withDetail = sref.current.terms.map((x) => (x.id === id ? { ...x, detail: d } : x));
        if (withDetail.find((x) => x.id === id)?.kept) void persist(withDetail);
      } catch (e) { dispatch({ type: "updateTerm", id, patch: { detailLoading: false } }); merge({ openId: null, errorMsg: msg(e) }); } // 실패 시 카드 접고 오류 표시(무한 로딩·무신호 차단)
    }
  }, [merge]);
  // 상세의 "함께 볼 어휘"가 현재 목록에 없으면, 그 어휘를 루트 카드 바로 아래에 새 카드로 추가하고 상세를 즉석 생성해 펼친다(리스트 카운트 +1).
  const expandRelated = async (name: string, rootId: string) => {
    const s = sref.current;
    const tier: "free" | "paid" = s.plan === "pro" ? "paid" : "free";
    if (s.terms.length >= s.limits.maxTotal[tier]) { merge({ proNotice: "cap" }); return; } // 누적 상한 동일 적용
    if (s.plan !== "pro" && s.detailCount >= s.limits.detailLimitFree) { merge({ proNotice: "detail" }); return; } // 무료 상세 한도 동일 적용
    const id = "x" + crypto.randomUUID().slice(0, 8);
    const n = s.terms.length;
    const term: UITerm = { term: name, kind: tr(s.locale, "related_kind"), one_line: "", why: "", priority: n + 1, tag: "몰라", id, kept: false, _new: true, detailLoading: true };
    dispatch({ type: "insertTermAfter", afterId: rootId, term });
    later(() => dispatch({ type: "updateTerm", id, patch: { _new: false } }), 780);
    merge({ openId: id, opening: id });
    later(() => { if (sref.current.opening === id) merge({ opening: null }); }, 340);
    try {
      const d = await api.detail({ term: name, kind: term.kind, area: s.classifyOut?.domain ?? "", job_type: s.classifyOut?.job_type ?? [], domain: s.classifyOut?.domain ?? "other", topic: s.input, locale: s.classifyOut?.search_locale ?? "en" }, tier);
      const lead = firstSentence(d.what) || name;
      dispatch({ type: "updateTerm", id, patch: { detail: d, detailLoading: false, one_line: lead, why: firstSentence(d.whymine) || lead } });
      if (s.plan !== "pro") merge({ detailCount: sref.current.detailCount + 1 }); // 성공한 즉석 상세만 무료 횟수 차감
    } catch (e) { dispatch({ type: "updateTerm", id, patch: { detailLoading: false, one_line: name } }); merge({ errorMsg: msg(e) }); }
  };
  const jumpRelated = (name: string, rootId?: string) => {
    const t = sref.current.terms.find((x) => x.term === name);
    if (t) { void toggleDetail(t.id); return; } // 이미 목록에 있으면 그 카드로 점프
    if (rootId) void expandRelated(name, rootId); // 없으면 루트 아래에 즉석 생성
  };
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
    if (s.plan !== "pro") { merge({ proNotice: "summary" }); return; }
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
    if (rec.narrow) {
      // 진행 중 세션: 좁히기를 복원해 이어서 진행한다. 이전 세션의 잔여 State(첨부파일·고지·오류 등)는 깨끗이 비운다(교차 누출 방지).
      const n = rec.narrow;
      merge({
        screen: "narrow", histView: false, resumedSession: true, sessionId: rec.id, input: rec.topic,
        classifyOut: n.classifyOut, questions: n.questions, answers: n.answers, unchosen: n.unchosen,
        usedUndo: n.usedUndo, tooHard: n.tooHard, simplify: n.simplify, refining: n.refining,
        confidence: n.confidence, turnsLeft: remainingTurns(sref.current.plan, n.answers, sref.current.limits), cond: n.cond ?? "",
        sel: [], customText: "", customOpen: false, query: "", difficulty: undefined, relateCond: "", relateOut: null,
        attachedFile: null, attachNote: "", dragging: false, prevScreen: "entry", showCond: false,
        limitHit: false, proNotice: "", errorMsg: "", pending: false, streaming: false,
      });
      return;
    }
    // 완료 세션: 생성한 전체 리스트(generated)가 있으면 그걸로 복원하되 kept 상태는 terms 멤버십으로(0담기여도 만든 리스트를 다시 본다). 구버전 레코드는 terms(담은 것)만.
    const useGen = !!(rec.generated && rec.generated.length > 0);
    const keptSet = new Set(rec.terms.map((t) => t.term));
    const src = useGen ? rec.generated! : rec.terms;
    const terms: UITerm[] = src.map((k, i) => ({
      term: k.term, kind: k.kind, priority: k.priority, why: k.why, one_line: k.one_line, tag: "몰라",
      ...(k.group ? { group: k.group } : {}),
      id: "h" + i, kept: useGen ? keptSet.has(k.term) : true, _new: false, ...(k.detail ? { detail: k.detail } : {}),
    }));
    // 완료 세션: 담은/생성 어휘 리스트로(세션을 닫지 않음). histView로 Terms를 읽기전용 처리.
    merge({
      screen: "terms", histView: true, resumedSession: false, terms, visibleCount: terms.length, openId: null,
      sessionId: rec.id, input: rec.topic, ctxInput: "", aiSummary: "", relateCond: "", relateOut: null, difficulty: undefined,
      classifyOut: { domain: rec.area, job_type: rec.job_type ?? [], condition_required: false, question: "", choices: [], search_locale: rec.locale === "ko" ? "ko" : "en", domain_risk: rec.domain_risk ?? "low" },
    });
  };

  const openPaywall = () => merge({ prevScreen: sref.current.screen, screen: "paywall", limitHit: false, proNotice: "" });
  const closePaywall = () => merge({ screen: sref.current.prevScreen === "paywall" ? "entry" : sref.current.prevScreen });
  // 페이월 CTA. 미리보기 토글을 폐기하고 실 결제 여정으로 배선한다(설계 H장).
  // 로그인이 가능하면 먼저 Google 로그인으로 계정을 연결하고 그다음 결제 진입을 시도한다.
  // Phase 0 은 결제 비활성이라 결제 진입이 coming_soon 을 돌려주므로 준비 중 안내를 띄운다(b안).
  const onPaywallCta = async () => {
    const s = sref.current;
    try {
      if (s.plan !== "pro" && auth.isLoginAvailable() && !(await auth.isLoggedIn())) {
        const { tier } = await auth.signInWithGoogle();
        merge({ plan: tier === "paid" ? "pro" : "flash", remaining: tier === "paid" ? 99 : s.limits.freeWeeklyLimit });
      }
    } catch {
      return; // 로그인 취소나 실패면 조용히 멈춘다.
    }
    try {
      const r = await api.checkout();
      if (r.checkout_url) { window.open(r.checkout_url, "_blank", "noopener"); return; } // Phase 1 실 결제
      merge({ proNotice: "coming_soon" }); // 결제 준비 중 안내
    } catch {
      merge({ proNotice: "coming_soon" });
    }
  };
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
  // 테스트 단계 임시 버튼 핸들러. 실 결제와 로그인 없이 pro 기능을 점검하려고 plan 을 수동 토글한다.
  // 출시 전에 이 핸들러와 하단 버튼, savedPlan 의 testpro 분기를 함께 제거한다.
  const toggleTestPro = () => {
    const s = sref.current;
    const toPro = s.plan !== "pro";
    const newTurns = remainingTurns(toPro ? "pro" : "flash", s.answers, s.limits);
    merge({ plan: toPro ? "pro" : "flash", remaining: toPro ? 99 : s.limits.freeWeeklyLimit, turnsLeft: newTurns });
    try { if (toPro) localStorage.setItem("sidetab:testpro", "1"); else localStorage.removeItem("sidetab:testpro"); } catch { /* 무시 */ }
  };

  useEffect(() => () => { abortRef.current?.abort(); window.clearTimeout(delTimer.current); }, []);
  // 진입 화면에 들어설 때마다 저장된 이전 탐색을 다시 읽어 리스트를 채운다(reset 후에도 갱신).
  useEffect(() => { if (state.screen === "entry" || state.screen === "sessions") { void loadSessions().then((list) => merge({ history: list })); void loadProjects().then((projects) => merge({ projects })); } }, [state.screen, merge]);
  // 세션 화면에서 ESC를 누르면 진입 화면으로 돌아간다(검색어도 비운다).
  useEffect(() => {
    if (state.screen !== "sessions") return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") merge({ screen: "entry", sessionsQuery: "" }); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.screen, merge]);
  // 워커 운영 한도(좁히기 턴·상세 횟수 등)를 한 번 읽어 게이팅에 쓴다. 실패 시 기본값 유지.
  useEffect(() => { void api.getConfig().then((l) => merge({ limits: l })); }, [merge]);
  // 저장된 로그인의 tier 로 플랜을 복원한다(로그인 후·새로고침·홈 복귀에 일관). 없으면 flash 유지.
  useEffect(() => { void auth.getPlan().then((p) => { if (p === "pro") merge({ plan: "pro", remaining: 99 }); }); }, [merge]);
  // 한도/플랜 변경 후 좁히기 예산을 실제 narrowMax로 하향 클램프(부풀림 금지, 소비분 보존).
  useEffect(() => {
    const max = state.plan === "pro" ? state.limits.narrowMax.paid : state.limits.narrowMax.free;
    if (state.turnsLeft > max) merge({ turnsLeft: max });
  }, [state.limits, state.plan, state.turnsLeft, merge]);
  // 턴 0으로 재개된 좁히기는 더 진행할 수 없어 바로 난이도/생성으로 보낸다(B=0 스킵). state에서 직접 읽어 stale 없음, pending 가드로 사용자 조작과 중복 방지.
  useEffect(() => {
    if (state.screen === "narrow" && state.resumedSession && state.turnsLeft <= 0 && state.answers.length > 0 && !state.pending) finishNarrow(false);
    // finishNarrow는 매 렌더 새로 생성되지만 의존성에서 제외한다(포함하면 매 렌더 발화). 조건이 전이 후 거짓이 되어 1회만 실행된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.screen, state.resumedSession, state.turnsLeft, state.answers.length, state.pending]);
  // 아키네이터(narrow)에서만 새로고침·닫기 시 브라우저 표준 경고(진행 중 좁히기 유실 안내). 화면 떠나면 해제(다른 화면 경고 누수 방지).
  useEffect(() => {
    if (state.screen !== "narrow") return;
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [state.screen]);
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
  // 하단 중앙 고지 토스트는 2초 뒤 자동으로 사라진다(CSS 애니메이션이 페이드인·홀드·페이드아웃을 같은 2초에 맞춘다).
  useEffect(() => {
    if (!state.proNotice) return;
    const id = window.setTimeout(() => merge({ proNotice: "" }), 2000);
    return () => window.clearTimeout(id);
  }, [state.proNotice, merge]);

  const live = state.screen === "narrow";
  return (
    <div id="app" className={live ? "live" : ""} role="application" aria-label="Vock note">
      {state.pending && <div className="bar" role="status"><i /></div>}
      <Header state={state} openPaywall={openPaywall} goHome={requestHome} changeLocale={changeLocale} openTutorial={() => merge({ tutorialOpen: true })} openDrawer={() => merge({ drawerOpen: true })} />
      {state.screen === "entry" && <Entry state={state} merge={merge} submitEntry={submitEntry} chip={chip} openHistory={openHistory} acceptFile={acceptFile} attachNotice={attachNotice} removeAttached={removeAttached} />}
      {state.screen === "narrow" && <Narrow state={state} merge={merge} toggleSel={toggleSel} nextStep={nextStep} undoStep={undoStep} jumpToTerms={jumpToTerms} />}
      {state.screen === "relate" && <RelateTurn state={state} pick={pickRelate} skip={skipRelate} />}
      {state.screen === "difficulty" && <DifficultyPick state={state} pick={pickDifficulty} back={backFromDifficulty} />}
      {state.screen === "terms" && <Terms state={state} merge={merge} loadMore={loadMore} toggleKeep={toggleKeep} toggleDetail={toggleDetail} jumpRelated={jumpRelated} go={go} goHome={goHome} refine={refineFromTerms} genGroup={genGroup} />}
      {state.screen === "kept" && <Kept state={state} merge={merge} go={go} goHome={goHome} toggleKeep={toggleKeep} toggleDetail={toggleDetail} jumpRelated={jumpRelated} buildSummary={buildSummary} onCopy={onCopy} onShare={onShare} aiRefine={aiRefine} />}
      {state.screen === "paywall" && <Paywall state={state} closePaywall={closePaywall} onPaywallCta={onPaywallCta} />}
      {state.screen === "refusal" && <Refusal state={state} goHome={goHome} />}
      {state.screen === "sessions" && <SessionsScreen state={state} merge={merge} openHistory={openHistory} deleteHistory={deleteHistory} undoDelete={undoDelete} togglePin={togglePin} goHome={goHome} assignProject={assignProject} />}
      {state.screen === "projects" && <ProjectsScreen state={state} merge={merge} addProject={addProject} removeProject={removeProject} />}
      {state.drawerOpen && <Drawer state={state} merge={merge} openHistory={openHistory} />}
      {state.proNotice && <ProSheet locale={state.locale} reason={state.proNotice} />}
      {state.confirmHome && <ConfirmHome locale={state.locale} answers={state.answers.length} onYes={confirmHomeYes} onNo={() => merge({ confirmHome: false })} />}
      {state.tutorialOpen && <Tutorial state={state} onClose={closeTutorial} />}
      {/* 테스트 단계 임시 버튼. 실 결제 전 pro 기능 점검용이며 출시 전 제거한다. */}
      <button onClick={toggleTestPro} title="테스트용 pro 토글 (출시 전 제거)" style={{ position: "absolute", bottom: 3, right: 6, zIndex: 60, fontSize: 9.5, lineHeight: 1.4, padding: "2px 7px", borderRadius: 9, border: "1px solid var(--border)", background: "var(--surface)", color: "var(--muted)", opacity: 0.6, cursor: "pointer" }}>{state.plan === "pro" ? "테스트: pro 해제" : "테스트: pro 적용"}</button>
    </div>
  );
}

// 잠긴 동작을 시도했을 때 화면 전환 없이 하단 중앙에 잠깐 뜨는 작은 고지 토스트(2초 뒤 자동 페이드아웃).
function ProSheet({ locale, reason }: { locale: OutputLocale; reason: string }) {
  const msg = reason === "weekly" ? tr(locale, "pw_limit") : tr(locale, "pw_r_" + reason);
  return (
    <div className="proSheet" role="status"><LockIcon /><span>{msg}</span></div>
  );
}

// 모달 공통 훅. 마운트 시 첫 포커스를 안으로 옮기고 Escape로 닫는다(키보드 접근). onClose는 ref로 잡아 매 렌더 재등록을 막는다.
function useModalClose(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const cb = useRef(onClose); cb.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") cb.current(); };
    window.addEventListener("keydown", onKey);
    ref.current?.querySelector<HTMLElement>("button, [href], input, textarea, select, [tabindex]")?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return ref;
}

// 진행 중 탐색을 두고 처음으로 갈지 한 번 확인하는 작은 모달(c-0-2). 튜토리얼과 같은 카드 패턴.
function ConfirmHome({ locale, answers, onYes, onNo }: { locale: OutputLocale; answers: number; onYes: () => void; onNo: () => void }) {
  const ref = useModalClose(onNo);
  return (
    <div className="modalBackdrop" onClick={onNo}>
      <div className="modalCard" ref={ref} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="confirmHomeTitle">
        <h2 id="confirmHomeTitle">{tr(locale, "home_confirm_title")}</h2>
        <p className="tutLead">{tr(locale, "home_confirm_sub", { n: answers })}</p>
        <div className="row2">
          <button className="btn btn-ghost" style={{ flex: 1 }} onClick={onNo}>{tr(locale, "home_confirm_no")}</button>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={onYes}>{tr(locale, "home_confirm_yes")}</button>
        </div>
      </div>
    </div>
  );
}

function msg(e: unknown): string { return e instanceof Error ? e.message : String(e); }

// ---------- 화면 컴포넌트 ----------
function Header({ state, openPaywall, goHome, changeLocale, openTutorial, openDrawer }: { state: State; openPaywall: () => void; goHome: () => void; changeLocale: (l: OutputLocale) => void; openTutorial: () => void; openDrawer: () => void }) {
  const warn = state.plan !== "pro" && state.remaining <= 2;
  const brandName = state.locale === "ko" ? "배경노트" : "Vock note";
  // 한국어만 부제(Vock note)를 단다. 비한국어 UI는 브랜드명이 곧 Vock note라 'Voca·back·note' 어원 부제를 빼서 깔끔하게 둔다.
  const brandSub = state.locale === "ko" ? "Vock note" : "";
  const navScreen = state.screen === "entry" || state.screen === "sessions" || state.screen === "projects";
  return (
    <header>
      {/* 좌상단 버거. 메인 화면들(홈·세션검색·프로젝트)에서 플로팅 선택 패널을 연다. 탐색 흐름 중엔 숨긴다. */}
      {navScreen && (
        <button className="iconbtn" onClick={openDrawer} aria-label={tr(state.locale, "sessions_open")} title={tr(state.locale, "sessions_open")}><ListIcon /></button>
      )}
      <button className="brand" onClick={goHome}>
        <span className="logo"><img src="icons/icon-32.png" alt="" width={24} height={24} /></span>
        <span><b>{brandName}</b>{brandSub && <span>{brandSub}</span>}</span>
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

function Entry({ state, merge, submitEntry, chip, openHistory, acceptFile, attachNotice, removeAttached }: { state: State; merge: (p: Partial<State>) => void; submitEntry: () => void; chip: (t: string) => void; openHistory: (rec: SessionRec) => void; acceptFile: (f: File) => void; attachNotice: () => void; removeAttached: () => void }) {
  const loc = state.locale;
  // 가장 최근 세션을 "이어서 보기" 카드로 승격(d-2).
  const recent = state.history[0];
  // 프로젝트 스코프 홈: 프로젝트에서 들어오면 그 프로젝트가 명시되고 새 세션이 거기에 속한다.
  const scopedProj = state.activeProject ? state.projects.find((p) => p.id === state.activeProject) : null;
  const projSessions = scopedProj ? state.history.filter((h) => h.projectId === scopedProj.id) : [];
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const grow = () => { const el = taRef.current; if (el) { el.style.height = "auto"; el.style.height = Math.min(el.scrollHeight, 160) + "px"; } };
  useEffect(grow, []);
  // 예시 칩: 약 50개 풀에서 랜덤 5개. loc나 chipSeed가 바뀔 때만 재추첨한다(타이핑 중엔 고정, 홈 복귀나 새로고침 때 새로 뽑는다). 칩마다 키프레임 종류와 속도, 시작 위상을 함께 무작위로 정해 그룹이 아니라 개별로 떠다니게 하고, 새로 뽑을 때마다 움직임이 달라진다.
  const picks = useMemo(() => {
    const names = ["chipFloatA", "chipFloatB", "chipFloatC"];
    return pickRandom(EXAMPLES[loc] ?? EXAMPLES.ko, 5).map((text) => {
      const dur = 4.5 + Math.random() * 3.5;
      return { text, name: names[Math.floor(Math.random() * names.length)] as string, dur, delay: -(Math.random() * dur) };
    });
  }, [loc, state.chipSeed]);
  // 드롭: 무료는 페이월로 튕기지 않고 하단 패널로 "pro 기능"임을 알린다(잠긴 첨부 클릭과 같은 경로).
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); merge({ dragging: false });
    const f = e.dataTransfer.files?.[0]; if (!f) return;
    if (state.plan !== "pro") { attachNotice(); return; }
    acceptFile(f);
  };
  const FILE_ACCEPT = "text/*,.txt,.md,.markdown,.csv,.json,.yml,.yaml,.xml,.html,.log,.tex";
  return (
    <main className="scroll entryMain screenIn" style={{ position: "relative" }}>
      {scopedProj && (
        <button className="link backlink" onClick={() => merge({ activeProject: undefined })}>← {tr(loc, "project_all")}</button>
      )}
      {/* 입력창 위치 고정. 메인 홈은 아래 예시칩·주간힌트가 입력창을 위로 밀어, 스코프 홈은 그게 없어 더 낮게 온다. 스코프 홈만 추가로 들어 올려 메인과 같은 높이로 맞춘다. */}
      <div className="hero" style={{ transform: scopedProj ? "translateY(-160px)" : "translateY(-90px)" }}>
        <h1 className="heroTitle">{scopedProj ? scopedProj.name : tr(loc, "entry_title")}</h1>
        <p className="heroSub">{scopedProj ? tr(loc, "entry_sub_project") : sentLines(tr(loc, state.plan === "pro" ? "entry_sub_pro" : "entry_sub"))}</p>
        <div className="heroGlow">
        {!scopedProj && <div className="aurora" aria-hidden="true" />}
        <div className={`composer ${state.inputErr ? "err" : ""}${state.dragging ? " dragging" : ""}`}
          onDragOver={(e) => { e.preventDefault(); if (!state.dragging) merge({ dragging: true }); }}
          onDragLeave={(e) => { e.preventDefault(); merge({ dragging: false }); }}
          onDrop={onDrop}>
          <textarea ref={taRef} className="composerInput" rows={1} aria-label={tr(loc, "entry_input_aria")}
            placeholder={tr(loc, "entry_input_ph")} value={state.input}
            onChange={(e) => { merge({ input: e.target.value }); grow(); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitEntry(); } }} />
          <div className="composerBar">
            {state.plan === "pro" ? <>
              <input ref={fileRef} type="file" accept={FILE_ACCEPT} style={{ display: "none" }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) acceptFile(f); e.target.value = ""; }} />
              <button className="attach" onClick={() => fileRef.current?.click()} aria-label={tr(loc, "attach")} title={tr(loc, "attach")}>{tr(loc, "attach_short")}</button>
            </> : (
              // 무료에도 첨부 어포던스를 잠금 상태로 미리 보여 "pro 기능"임을 알린다(드롭 시 뒤늦은 페이월 방지).
              <button className="attach locked" onClick={attachNotice} aria-label={tr(loc, "attach")} title={tr(loc, "attach")}><span>{tr(loc, "attach_short")}</span><LockIcon /></button>
            )}
            <button className="condToggle" onClick={() => merge({ showCond: !state.showCond })}>{state.showCond ? tr(loc, "cond_close") : tr(loc, "cond_add")}</button>
            <button className="send" onClick={submitEntry} aria-label={tr(loc, "next")}>→</button>
          </div>
        </div>
        {state.attachedFile && <div className="filechip"><span className="fn">📄 {state.attachedFile.name}</span><button onClick={removeAttached} aria-label={tr(loc, "attach_remove")}>×</button></div>}
        {state.attachNote && <div className="errmsg" style={{ textAlign: "center" }}>{tr(loc, state.attachNote)}</div>}
        {state.inputErr && <div className="errmsg" style={{ textAlign: "center" }}>{tr(loc, "entry_err")}</div>}
        {state.showCond && <input className="field condField" aria-label={tr(loc, "cond_aria")} placeholder={tr(loc, "cond_ph")} value={state.cond} onChange={(e) => merge({ cond: e.target.value })} />}
        {!scopedProj && state.plan !== "pro" && state.remaining > 0 && <p className="weeklyHint">{tr(loc, state.remaining === 1 ? "entry_weekly_last" : "entry_weekly_cost")}</p>}
        {!scopedProj && <div className="suggest">
          {picks.map((c) => <button key={c.text} className="sg" style={{ animationName: c.name, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }} onClick={() => { chip(c.text); taRef.current?.focus(); requestAnimationFrame(grow); }}>{c.text}</button>)}
          <button className="shuffle" onClick={() => merge({ chipSeed: state.chipSeed + 1 })} aria-label={tr(loc, "shuffle")} title={tr(loc, "shuffle")}><RefreshIcon /></button>
        </div>}
        </div>
      </div>
      {/* 스코프 홈: 입력창은 메인과 동일하게 고정하고, 세션 리스트는 hero 밖에 띄워 자체 스크롤한다. 리스트 개수가 입력창 위치를 건드리지 않는다. */}
      {scopedProj && (
        <div className="scroll" style={{ position: "absolute", left: 16, right: 16, top: "calc(50% - 10px)", bottom: 14, overflowY: "auto", display: "flex", flexDirection: "column", gap: 7 }}>
          {projSessions.length === 0 ? (
            <p className="note" style={{ margin: 0 }}>{tr(loc, "project_empty_hint")}</p>
          ) : projSessions.map((h) => (
            <div key={h.id} className="histitem">
              <button className="histmain" onClick={() => openHistory(h)}>
                <span className="histtopic">{h.topic || tr(loc, "history_untitled")}</span>
                <span className="histmeta">{h.narrow
                  ? tr(loc, "resume_narrow_meta", { n: remainingTurns(state.plan, h.narrow.answers, state.limits), date: fmtDate(h.updatedAt, loc) })
                  : h.terms.length > 0
                    ? tr(loc, "history_meta", { n: h.terms.length, date: fmtDate(h.createdAt, loc) })
                    : tr(loc, "resume_gen_meta", { n: h.generated?.length ?? 0, date: fmtDate(h.createdAt, loc) })}</span>
              </button>
            </div>
          ))}
        </div>
      )}
      {/* 비스코프 홈의 하단 고정 영역(이어서 보기, 모두 보기, 안내문). 흐름에서 빼 컴포저 중앙 정렬을 건드리지 않는다. */}
      {!scopedProj && (
        <>
          {recent && (
            <div style={{ position: "absolute", left: 16, right: 16, bottom: 205, display: "flex", flexDirection: "column" }}>
              <button className={`resume ${recent.narrow ? "inprog" : ""}`} onClick={() => openHistory(recent)}>
                <span className="resumeText">
                  <span className="resumeEy">{recent.narrow ? <span className="inprogPill">{tr(loc, "resume_in_progress")}</span> : tr(loc, "resume_eyebrow")}</span>
                  <b>{recent.area || recent.topic || tr(loc, "history_untitled")}</b>
                  <span className="resumeMeta">{recent.narrow
                    ? tr(loc, "resume_narrow_meta", { n: remainingTurns(state.plan, recent.narrow.answers, state.limits), date: fmtDate(recent.updatedAt, loc) })
                    : recent.terms.length > 0
                      ? tr(loc, "resume_meta", { n: recent.terms.length, date: fmtDate(recent.createdAt, loc) })
                      : tr(loc, "resume_gen_meta", { n: recent.generated?.length ?? 0, date: fmtDate(recent.createdAt, loc) })}</span>
                </span>
                <span className="resumeGo">{tr(loc, "resume_go")} →</span>
              </button>
              {state.history.length > 1 && (
                <button className="link" style={{ alignSelf: "flex-end", fontSize: "12.5px" }} onClick={() => merge({ screen: "sessions" })}>
                  {tr(loc, "sessions_all", { n: state.history.length })}
                </button>
              )}
            </div>
          )}
          <p className="note entryNote" style={{ position: "absolute", left: 16, right: 16, bottom: 14, marginTop: 0 }}>{tr(loc, "entry_note")}</p>
        </>
      )}
    </main>
  );
}

// 세션 정돈 화면. 좌상단 버거로 진입(좌 슬라이드). 검색·고정·날짜 버킷으로 과거 탐색에 빠르게 복귀한다.
// 입력 화면이 아니라 선택·탐색 화면이라, 메인 진입(Entry)과 분리해 깔끔하게 둔다.
function SessionsScreen({ state, merge, openHistory, deleteHistory, undoDelete, togglePin, goHome, assignProject }: { state: State; merge: (p: Partial<State>) => void; openHistory: (rec: SessionRec) => void; deleteHistory: (id: string) => void; undoDelete: () => void; togglePin: (id: string) => void; goHome: () => void; assignProject: (id: string, projectId: string | undefined) => void }) {
  const loc = state.locale;
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { searchRef.current?.focus(); }, []);
  const [assignId, setAssignId] = useState<string | null>(null);
  const q = (state.sessionsQuery ?? "").trim().toLowerCase();
  const filtered = q ? state.history.filter((h) => `${h.topic} ${h.area}`.toLowerCase().includes(q)) : state.history;
  const pinned = filtered.filter((h) => h.pinned);
  const loose = filtered.filter((h) => !h.pinned);
  const meta = (h: SessionRec) => h.narrow
    ? tr(loc, "resume_narrow_meta", { n: remainingTurns(state.plan, h.narrow.answers, state.limits), date: fmtDate(h.updatedAt, loc) })
    : h.terms.length > 0
      ? tr(loc, "history_meta", { n: h.terms.length, date: fmtDate(h.createdAt, loc) })
      : tr(loc, "resume_gen_meta", { n: h.generated?.length ?? 0, date: fmtDate(h.createdAt, loc) });
  const row = (h: SessionRec) => (
    <div key={h.id}>
      <div className="histitem">
        <button className="histmain" onClick={() => openHistory(h)}>
          <span className="histtopic">{h.topic || tr(loc, "history_untitled")}</span>
          <span className="histmeta">{meta(h)}</span>
        </button>
        {state.projects.length > 0 && (
          <button className="keepmini" style={h.projectId ? { color: "var(--accent-ink)" } : undefined} onClick={() => setAssignId(assignId === h.id ? null : h.id)} aria-label={tr(loc, "project_assign")} title={tr(loc, "project_assign")}><FolderIcon /></button>
        )}
        <button className={`keepmini ${h.pinned ? "on" : ""}`} onClick={() => togglePin(h.id)} aria-label={tr(loc, h.pinned ? "pin_on" : "pin_off")} title={tr(loc, h.pinned ? "pin_on" : "pin_off")}><BookmarkIcon /></button>
        <button className="histdel" onClick={() => deleteHistory(h.id)} aria-label={tr(loc, "history_delete")} title={tr(loc, "history_delete")}><TrashIcon /></button>
      </div>
      {assignId === h.id && (
        <div className="chips" style={{ margin: "0 0 8px 4px" }}>
          {state.projects.map((p) => (
            <button key={p.id} className={`chip ${h.projectId === p.id ? "sel" : ""}`} onClick={() => { assignProject(h.id, p.id); setAssignId(null); }}>{p.name}</button>
          ))}
          {h.projectId && <button className="chip" onClick={() => { assignProject(h.id, undefined); setAssignId(null); }}>{tr(loc, "project_remove")}</button>}
        </div>
      )}
    </div>
  );
  const buckets: { key: "today" | "week" | "older"; label: string }[] = [
    { key: "today", label: tr(loc, "sessions_today") },
    { key: "week", label: tr(loc, "sessions_week") },
    { key: "older", label: tr(loc, "sessions_older") },
  ];
  const empty = state.history.length === 0;
  const noResult = !empty && filtered.length === 0;
  return (
    <main className="scroll screenInLeft"><div className="pad" style={{ display: "flex", flexDirection: "column" }}>
      <button className="link backlink" onClick={() => merge({ screen: "entry", sessionsQuery: "" })}>← {tr(loc, "sessions_back")}</button>
      {empty ? (
        <div className="center">
          <div className="mark"><ListIcon /></div>
          <p className="lead">{tr(loc, "sessions_empty")}</p>
          <button className="btn btn-primary" onClick={goHome}>{tr(loc, "sessions_empty_cta")}</button>
        </div>
      ) : (
        <>
          <div className="searchwrap"><Spark /><input ref={searchRef} className="search" placeholder={tr(loc, "sessions_search_ph")} value={state.sessionsQuery ?? ""} onChange={(e) => merge({ sessionsQuery: e.target.value })} /></div>
          {noResult && <p className="note">{tr(loc, "sessions_noresult")}</p>}
          {pinned.length > 0 && <>
            <div className="grouphead"><b>{tr(loc, "sessions_pinned")}</b><i /></div>
            {pinned.map(row)}
          </>}
          {buckets.map((b) => {
            const items = loose.filter((h) => dateBucket(h.updatedAt ?? h.createdAt) === b.key);
            if (!items.length) return null;
            return (
              <div key={b.key}>
                <div className="grouphead"><b>{b.label}</b><i /></div>
                {items.map(row)}
              </div>
            );
          })}
        </>
      )}
      {state.pendingDel && (
        <div className="snackbar" role="status">
          <span>{tr(loc, "hist_deleted")}</span>
          <button className="link" onClick={undoDelete}>{tr(loc, "hist_undo")}</button>
        </div>
      )}
    </div></main>
  );
}

// 좌상단 버거로 여는 플로팅 선택 패널. 입력 없이 모드 전환과 최근 세션 점프만. 좁은 패널이라 작게 떠 있고 바깥을 누르면 닫힌다.
function Drawer({ state, merge, openHistory }: { state: State; merge: (p: Partial<State>) => void; openHistory: (rec: SessionRec) => void }) {
  const loc = state.locale;
  const close = () => merge({ drawerOpen: false });
  const ref = useModalClose(close);
  const recent = state.history.slice(0, 7);
  const meta = (h: SessionRec) => h.narrow
    ? tr(loc, "resume_narrow_meta", { n: remainingTurns(state.plan, h.narrow.answers, state.limits), date: fmtDate(h.updatedAt, loc) })
    : h.terms.length > 0
      ? tr(loc, "history_meta", { n: h.terms.length, date: fmtDate(h.createdAt, loc) })
      : tr(loc, "resume_gen_meta", { n: h.generated?.length ?? 0, date: fmtDate(h.createdAt, loc) });
  return (
    <div className="drawerWrap" onClick={close}>
      <div className="drawerPanel" ref={ref} onClick={(e) => e.stopPropagation()} aria-label={tr(loc, "sessions_open")}>
        <button className={`drawerItem ${state.screen === "projects" ? "sel" : ""}`} onClick={() => merge({ screen: "projects", activeProject: undefined, drawerOpen: false })}><FolderIcon /><span className="di">{tr(loc, "drawer_projects")}</span></button>
        <button className={`drawerItem ${state.screen === "sessions" ? "sel" : ""}`} onClick={() => merge({ screen: "sessions", drawerOpen: false })}><Spark /><span className="di">{tr(loc, "drawer_search")}</span></button>
        {recent.length > 0 && (
          <>
            <div className="drawerDiv" />
            <div className="drawerHead">{tr(loc, "drawer_recent")}</div>
            {recent.map((h) => (
              <button key={h.id} className="drawerItem" onClick={() => { merge({ drawerOpen: false }); openHistory(h); }}>
                <span className="di">{h.topic || tr(loc, "history_untitled")}</span>
                <span className="dm">{meta(h)}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

// 프로젝트 탐색 화면(드로어 "프로젝트" 모드). 프로젝트를 만들고 지운다. 프로젝트를 누르면 그 프로젝트로 스코프된 홈으로 간다.
function ProjectsScreen({ state, merge, addProject, removeProject }: { state: State; merge: (p: Partial<State>) => void; addProject: (name: string) => void; removeProject: (id: string) => void }) {
  const loc = state.locale;
  const [name, setName] = useState("");
  const create = () => { if (name.trim()) { addProject(name); setName(""); } };
  const count = (id: string) => state.history.filter((h) => h.projectId === id).length;
  return (
    <main className="scroll screenInLeft"><div className="pad" style={{ display: "flex", flexDirection: "column" }}>
      <button className="link backlink" onClick={() => merge({ screen: "entry" })}>← {tr(loc, "sessions_back")}</button>
      <h2 style={{ marginBottom: 12 }}>{tr(loc, "drawer_projects")}</h2>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        <input className="search" style={{ paddingLeft: 11 }} placeholder={tr(loc, "project_new_ph")} value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") create(); }} />
        <button className="pillbtn primary" onClick={create}>{tr(loc, "project_create")}</button>
      </div>
      {state.projects.length === 0 ? (
        <p className="note">{tr(loc, "projects_empty")}</p>
      ) : (
        <div className="history">
          {state.projects.map((p) => (
            <div key={p.id} className="histitem">
              <button className="histmain" onClick={() => merge({ screen: "entry", activeProject: p.id })}>
                <span className="histtopic">{p.name}</span>
                <span className="histmeta">{tr(loc, "project_count", { n: count(p.id) })}</span>
              </button>
              <button className="histdel" onClick={() => removeProject(p.id)} aria-label={tr(loc, "project_delete")} title={tr(loc, "project_delete")}><TrashIcon /></button>
            </div>
          ))}
        </div>
      )}
    </div></main>
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
    return (<main className="scroll entryMain screenIn"><div className="thinking">
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
  // 종료 범위(c-2-3): 무료는 최대 3턴, pro는 3~8턴. AI가 충분하다고 보면 더 일찍 끝난다.
  const maxT = state.plan === "pro" ? maxPaid : state.limits.narrowMax.free;
  // 공유 예산이 만충이면 종료 범위 안내, 차감됐으면 남은 턴 하나만 표시(이중 숫자 혼란 방지, C2).
  const budgetFull = state.turnsLeft >= maxT;
  return (
    <main className="scroll screenIn"><div className="pad" style={{ display: "flex", flexDirection: "column" }}>
      <div className="aiwrap">
        <span className="aimeta">{tr(loc, "narrow_ai", { n: idx + 1 })}{state.confidence >= 0.75 ? tr(loc, "narrow_almost") : ""}</span>
        {(state.answers.length > 0 || state.usedUndo) && <button className="link" style={{ marginLeft: "auto" }} disabled={state.usedUndo} onClick={undoStep} title={tr(loc, "undo_title")}>{tr(loc, "undo")}</button>}
      </div>
      {/* c-2-1: "어려워요"를 고르면(또는 이후 턴 내내) 쉬운 말로 묻는다는 걸 확인해 준다. */}
      {(state.simplify || state.tooHard) && <p className="aihint">{tr(loc, "narrow_simplified")}</p>}
      <div className={`progress${proPhase ? " pro" : ""}`} style={{ marginBottom: 8 }}>
        <div className="track base"><i style={{ width: pct + "%" }} /></div>
        {proPhase && <div className="track extra"><i style={{ width: extraPct + "%" }} /></div>}
        {proPhase
          ? <span className="promark">/{maxPaid}</span>
          : (state.plan !== "pro" && <span className="prolock" title={tr(loc, "prolock_title")}><LockIcon />{tr(loc, "prolock")}</span>)}
      </div>
      {/* c-2-3: 자동 종료 가변성을 진행바 옆에 범위로 알린다(언제 끝날지 예측 가능하게). */}
      <p className="rangehint">{state.resumedSession && state.answers.length > 0
        ? tr(loc, "narrow_resume_hint", { n: state.turnsLeft })
        : budgetFull ? tr(loc, state.plan === "pro" ? "narrow_range_pro" : "narrow_range_free", { min: MIN_Q, max: maxT }) : tr(loc, "narrow_budget", { n: state.turnsLeft })}</p>
      <h2 style={{ marginTop: 14 }}>{sentLines(cur?.question ?? "")}</h2>
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
      {/* c-2-4: 좁히기가 길어진(3턴 이상) 뒤엔 "지금 충분해요" 탈출구의 위계를 높인다. */}
      {idx >= MIN_Q
        ? <button className="btn btn-ghost" style={{ marginTop: 10 }} onClick={jumpToTerms}>{tr(loc, "narrow_jump")}</button>
        : <button className="link" style={{ marginTop: 12, alignSelf: "center" }} onClick={jumpToTerms}>{tr(loc, "narrow_jump")}</button>}
    </div></main>
  );
}

// 연결 턴. 좁히기 종료 직전, 같은 프로젝트에서 담은 어휘가 현재 작업과 연결되는지 재인 질문으로 묻는다(메커니즘 2, 4).
// 사용자가 고른 방향만 추천 맥락에 반영하고, "관련 없어요"로 언제든 건너뛸 수 있어 불투명·오염을 피한다.
function RelateTurn({ state, pick, skip }: { state: State; pick: (label: string) => void; skip: () => void }) {
  const loc = state.locale;
  if (state.relateLoading || !state.relateOut) {
    return (<main className="scroll entryMain screenIn"><div className="thinking">
      <div className="aiav"><Spark /></div>
      <div className="msg">{sentLines(tr(loc, "relate_loading"))}</div>
      <div className="dots3"><i /><i /><i /></div>
    </div></main>);
  }
  const out = state.relateOut;
  return (
    <main className="scroll screenIn"><div className="pad" style={{ display: "flex", flexDirection: "column" }}>
      <div className="aiwrap"><span className="aimeta">{tr(loc, "relate_eyebrow")}</span></div>
      {out.related_terms.length > 0 && (
        <div className="chips" style={{ margin: "2px 0 6px" }}>
          {out.related_terms.map((t) => <span key={t} className="chip sel">{tr(loc, "relate_kept_chip", { term: t })}</span>)}
        </div>
      )}
      <h2 style={{ marginTop: 10 }}>{sentLines(out.question)}</h2>
      <p className="lead" style={{ margin: "6px 0 16px" }}>{tr(loc, "relate_lead")}</p>
      {out.choices.map((o) => (
        <button key={o.label} className="opt" onClick={() => pick(o.label)}><span>{o.label}</span><span className="tick">✓</span></button>
      ))}
      <button className="btn btn-ghost" style={{ marginTop: 12 }} onClick={skip}>{tr(loc, "relate_skip")}</button>
    </div></main>
  );
}

// 좁히기 종료 직전 어휘 깊이를 고르는 화면(묶음4 + Item1). 깊이별 대표 어휘 예시(LLM 생성)를 카드에 보여 감으로 고르게 한다.
function DifficultyPick({ state, pick, back }: { state: State; pick: (l: Difficulty) => void; back: () => void }) {
  const loc = state.locale;
  const p = state.previews;
  const loading = state.previewLoading;
  const topic = state.classifyOut?.domain || state.input;
  const isB0 = state.answers.length === 0;
  const levels: { key: Difficulty; depth: number; nameKey: string; descKey: string; ex?: { term: string; line: string } }[] = [
    { key: "기초", depth: 1, nameKey: "diff_basic", descKey: "diff_basic_desc", ex: p?.basic },
    { key: "중급", depth: 2, nameKey: "diff_inter", descKey: "diff_inter_desc", ex: p?.inter },
    { key: "심화", depth: 3, nameKey: "diff_adv", descKey: "diff_adv_desc", ex: p?.adv },
  ];
  return (
    <main className="scroll screenIn"><div className="pad" style={{ display: "flex", flexDirection: "column" }}>
      <button className="link backlink" onClick={back}>← {tr(loc, isB0 ? "diff_back_home" : "diff_back_narrow")}</button>
      <div className="diffintro">
        <div className="eyebrow">{tr(loc, "diff_eyebrow")}</div>
        <h2>{tr(loc, "diff_title")}</h2>
        {topic && <span className="topicchip">{topic}</span>}
        <p className="lead" style={{ margin: "8px 0 0" }}>{tr(loc, "diff_sub")}</p>
        {/* 좁히기를 한 번도 안 했으면(예산 소진으로 스킵) 왜 질문이 없는지 알린다. */}
        {isB0 && <p className="aihint" style={{ margin: "10px 0 0" }}>{tr(loc, "narrow_b0_skip")}</p>}
      </div>
      <div className="difflist">
        {levels.map((lv) => (
          <button key={lv.key} className={`diffcard d${lv.depth}`} onClick={() => pick(lv.key)}>
            <span className="diffhead">
              <span className="diffname">{tr(loc, lv.nameKey)}</span>
              <span className="diffbars" aria-hidden="true"><i className="on" /><i className={lv.depth >= 2 ? "on" : ""} /><i className={lv.depth >= 3 ? "on" : ""} /></span>
            </span>
            <span className="diffdesc">{tr(loc, lv.descKey)}</span>
            {(loading || lv.ex) && (
              <span className="diffex">
                {lv.ex
                  ? <><b className="diffexTerm">{lv.ex.term}</b><span className="diffexLine">{lv.ex.line}</span></>
                  : <span className="diffexSkel" aria-hidden="true"><i /><i /></span>}
              </span>
            )}
          </button>
        ))}
      </div>
    </div></main>
  );
}

function Detail({ t, locale, opening, jumpRelated, toggleKeep }: { t: UITerm; locale: OutputLocale; opening: boolean; jumpRelated: (n: string, rootId?: string) => void; toggleKeep: (id: string) => void }) {
  if (t.detailLoading || !t.detail) return <div className="detail"><p className="dtext" style={{ color: "var(--muted)" }}>{tr(locale, "detail_loading")}</p></div>;
  const d = t.detail;
  // 개념은 핵심(첫 문장)을 굵게 두고 나머지를 이어 보여준다(핵심 우선). 활용은 문장을 단계로 쪼갠다.
  const whatSents = splitSentences(d.what);
  const whatLead = whatSents[0] ?? d.what;
  const whatRest = whatSents.slice(1);
  // 활용 단계. LLM이 붙인 "1." "2." "-" 같은 마커를 떼고(숫자만 남은 빈 항목도 제거) 깨끗한 문장만 남긴다. UI가 번호를 매긴다.
  const howSteps = splitSentences(d.how).map((s) => s.replace(/^\s*(\d+[.)]|[-•*·])\s*/, "").trim()).filter(Boolean);
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
          {hasVal(t.context_note) && <div className="dsub"><b>{tr(locale, "detail_ctx")}</b>{sentLines(t.context_note as string)}</div>}
        </section>
        <section className="dpart">
          <div className="dlabel">{tr(locale, "dlabel_how")}</div>
          <ul className="dsteps">{howSteps.map((s, i) => <li key={i}>{s}</li>)}</ul>
          {hasVal(t.direction) && <div className="dsub"><b>{tr(locale, "detail_dir")}</b>{sentLines(t.direction as string)}</div>}
          {hasVal(t.use_example) && <div className="dsub"><b>{tr(locale, "detail_ex")}</b>{sentLines(t.use_example as string)}</div>}
        </section>
        {hasVal(d.misc) && <p className="dmemo"><InfoIcon />{sentLines(d.misc as string)}</p>}
      </div>
      <div className="dsec" style={{ marginTop: 16 }}>{tr(locale, "detail_sec2")}</div>
      {d.related.length > 0 && <div className="related">{d.related.map((r) => <button key={r} className="relbtn" onClick={() => jumpRelated(r, t.id)}>{r} ↗</button>)}</div>}
      {d.sources.length > 0
        ? d.sources.map((s, i) => <a key={i} className="src" href={s.url} target="_blank" rel="noopener noreferrer"><span style={{ color: "var(--faint)", flex: "0 0 auto" }}><LinkIcon /></span><span style={{ flex: 1, minWidth: 0 }}><b>{s.title}</b><small>{s.site}</small></span></a>)
        : <div className="nosrc"><InfoIcon />{sentLines(tr(locale, "detail_nosrc"))}</div>}
      <button className={`keepbtn big ${t.kept ? "on" : ""}`} onClick={() => toggleKeep(t.id)}>{t.kept ? tr(locale, "keep_detail_on") : tr(locale, "keep_detail_off")}</button>
    </div>
  );
}

function Card({ t, i, state, toggleKeep, toggleDetail, jumpRelated }: { t: UITerm; i: number; state: State; toggleKeep: (id: string) => void; toggleDetail: (id: string) => void; jumpRelated: (n: string) => void }) {
  const loc = state.locale;
  const open = state.openId === t.id;
  const animStyle = t._new ? { animation: `cardIn .42s ease both`, animationDelay: `${i * 55}ms` } : undefined;
  // c-4-2: 펼치면 그 카드를 위로 끌어와 긴 상세가 한눈에 보이게 한다(아래 카드가 밀려 위치가 어긋나는 점프 완화). 상세가 렌더된 뒤 스크롤.
  const cardRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const id = window.setTimeout(() => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 60);
    return () => window.clearTimeout(id);
  }, [open]);
  return (
    <div ref={cardRef} className={`card ${open ? "open" : ""}${t.kept ? " kept" : ""}`} style={animStyle}>
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

function Terms({ state, merge, loadMore, toggleKeep, toggleDetail, jumpRelated, go, goHome, refine, genGroup }: { state: State; merge: (p: Partial<State>) => void; loadMore: () => void; toggleKeep: (id: string) => void; toggleDetail: (id: string) => void; jumpRelated: (n: string) => void; go: (s: Screen) => void; goHome: () => void; refine: (text: string) => void; genGroup: (group: string) => void }) {
  // 이전 탐색을 불러온 읽기전용 보기. stub classifyOut라 생성 액션(재탐색·더보기·그룹생성)을 막고, 막다른 길이 안 되게 처음으로 버튼을 둔다.
  const ro = state.histView;
  const loc = state.locale;
  const revealed = state.terms.slice(0, state.visibleCount);
  let active = [...revealed];
  if (state.groupView) active = [...active].sort((a, b) => (a.group ?? "").localeCompare(b.group ?? "") || a.priority - b.priority);
  const keptCount = revealed.filter((t) => t.kept).length;
  // 무료 상세 열람 잔여(c-4-1). 펼친(캐시) 카드 재열람은 무제한이라 안내 문구로 안심시킨다.
  const detailLeft = Math.max(0, state.limits.detailLimitFree - state.detailCount);
  let lastG: string | undefined;
  return (
    <>
      <main className="scroll screenIn"><div style={{ padding: "13px 13px 14px" }}>
        {ro && <button className="link" style={{ alignSelf: "flex-start", color: "var(--muted)", marginBottom: 12 }} onClick={goHome}>{tr(loc, "kept_back_home")}</button>}
        <div className="tagrow"><span className="minitag">{state.classifyOut?.domain ?? tr(loc, "terms_domain_fallback")}</span><small>{tr(loc, ro ? "terms_domain_saved" : "terms_domain_label")}</small></div>
        {!ro && <p className="note" style={{ margin: "1px 0 0", fontSize: 12 }}>{tr(loc, "terms_rationale")}</p>}
        {/* 조건 재탐색 검색창. 이전 탐색(읽기전용)에선 숨긴다 — stub classifyOut로 엉뚱한 도메인 생성·복원 어휘 교체 방지. */}
        {!ro && <div className="searchwrap"><Spark /><input className={`search${state.plan === "pro" ? "" : " locked"}`} aria-label={tr(loc, "terms_refine_label")} placeholder={tr(loc, state.plan === "pro" ? "terms_refine_ph" : "terms_refine_free")} value={state.query} onChange={(e) => merge({ query: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); refine(state.query); } }} />{state.plan !== "pro" && <span className="searchlock"><LockIcon /></span>}</div>}
        <div className="toolrow"><span className="hint">{tr(loc, "terms_count", { max: state.plan === "pro" ? state.limits.maxTotal.paid : state.limits.maxTotal.free, n: state.terms.length })}</span><button className={`toggle ${state.groupView ? "on" : ""}`} onClick={() => merge({ groupView: !state.groupView })}>{state.groupView ? tr(loc, "group_off") : tr(loc, "group_on")}</button></div>
        {/* 한 줄 맥락 안내: 그룹뷰면 그룹별 생성 힌트(c-3-4), 아니면 추천 정렬 기준(c-3-5) + 무료 상세 잔여(c-4-1). */}
        <div className="listnote">
          {state.groupView
            ? <span>{tr(loc, "group_hint")}</span>
            : <><span>{tr(loc, "order_hint")}</span>{state.plan !== "pro" && <span className={detailLeft <= 1 ? "dleft warn" : "dleft"} title={tr(loc, "detail_cache_note")}> · {tr(loc, "detail_left", { left: detailLeft })}</span>}</>}
        </div>
        {state.errorMsg && <div className="taghint" style={{ color: "var(--warn-ink)" }}><span>{state.errorMsg}</span></div>}
        {active.length > 0 ? active.map((t, i) => {
          const head = state.groupView && t.group !== lastG ? <div key={"g" + t.id} className="grouphead"><b>{t.group}</b><i />{!ro && <button className="groupgen" onClick={() => genGroup(t.group as string)} disabled={!!state.groupGenLoading}>{state.groupGenLoading === t.group ? tr(loc, "group_gen_loading") : tr(loc, "group_gen", { n: state.plan === "pro" ? state.limits.groupGen.paid : state.limits.groupGen.free })}</button>}</div> : null;
          lastG = t.group;
          return <div key={t.id}>{head}<Card t={t} i={i} state={state} toggleKeep={toggleKeep} toggleDetail={toggleDetail} jumpRelated={jumpRelated} /></div>;
        }) : <p className="note" style={{ margin: "24px 0" }}>{state.streaming ? tr(loc, "terms_loading") : tr(loc, "terms_nomatch")}</p>}
        {!ro && (state.moreLoaded
          ? <button className="more done">{tr(loc, "more_done")}</button>
          : <button className="more" onClick={loadMore}>{state.moreLoading ? tr(loc, "more_loading") : state.plan === "pro" ? tr(loc, "more_load") : <>{tr(loc, "more_load_locked")}<LockIcon /></>}</button>)}
        <p className="note" style={{ marginTop: 13 }}>{tr(loc, ro ? "terms_foot_saved" : "terms_foot_note")}</p>
      </div></main>
      <div className="foot">
        <div style={{ flex: 1, fontSize: 12.5, color: "var(--muted)" }}>{tr(loc, "kept_count", { n: keptCount })}</div>
        <button className="btn-ghost" style={{ width: "auto", padding: "9px 15px", borderRadius: 10, fontSize: 14.5, fontWeight: 600 }} onClick={() => go("kept")} disabled={keptCount === 0} title={keptCount === 0 ? tr(loc, "kept_view_empty_title") : undefined}>{keptCount === 0 ? tr(loc, "kept_view_empty") : tr(loc, "kept_view")}</button>
      </div>
    </>
  );
}

function Kept({ state, merge, go, goHome, toggleKeep, toggleDetail, jumpRelated, buildSummary, onCopy, onShare, aiRefine }: { state: State; merge: (p: Partial<State>) => void; go: (s: Screen) => void; goHome: () => void; toggleKeep: (id: string) => void; toggleDetail: (id: string) => void; jumpRelated: (n: string) => void; buildSummary: (s: State) => string; onCopy: () => void; onShare: () => void; aiRefine: () => void }) {
  const loc = state.locale;
  const copyLabel = state.copied ? tr(loc, "copy_done") : tr(loc, "copy");
  const kept = state.terms.filter((t) => t.kept);
  return (
    <main className="scroll screenIn"><div className="pad" style={{ display: "flex", flexDirection: "column" }}>
      {/* 어휘가 있으면 리스트로 돌아가고(이어서보기·일반 세션 공통), 없을 때만 처음으로. prevScreen은 openHistory에서 안 바뀌어 쓰지 않는다. */}
      <button className="link" style={{ alignSelf: "flex-start", color: "var(--muted)", marginBottom: 13 }} onClick={() => (state.terms.length > 0 ? go("terms") : goHome())}>{state.terms.length > 0 ? tr(loc, "kept_back_terms") : tr(loc, "kept_back_home")}</button>
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
          {/* 무료는 입력란도 잠가 방향성을 길게 적고 페이월을 만나는 헛수고를 막는다. */}
          <input className="field" style={{ flex: 3 }} disabled={state.plan !== "pro"} aria-label={tr(loc, "refine_dir_ph")} placeholder={tr(loc, state.plan === "pro" ? "refine_dir_ph" : "refine_dir_locked")} value={state.ctxInput} onChange={(e) => merge({ ctxInput: e.target.value })} />
          <button className="btn btn-ghost refinebtn" style={{ flex: 1 }} onClick={aiRefine}><span className="rlabel">{state.aiSummaryLoading ? tr(loc, "refine_loading") : state.plan === "pro" ? tr(loc, "refine") : <>{tr(loc, "refine_locked")}<LockIcon /></>}</span></button>
        </div>
        {state.aiSummary && <div className="summary" style={{ marginTop: 10 }}>{state.aiSummary}</div>}
      </>}
      <button className="link" style={{ alignSelf: "center", color: "var(--muted)", marginTop: 14 }} onClick={goHome}>{tr(loc, "restart")}</button>
      <p className="note">{tr(loc, "kept_note")}</p>
    </div></main>
  );
}

function Paywall({ state, closePaywall, onPaywallCta }: { state: State; closePaywall: () => void; onPaywallCta: () => void }) {
  const loc = state.locale;
  // 지역 가격: 국내(ko)는 원화 부가세 포함, 그 외는 달러 세금 별도. 정밀한 지역 판별(IP 기반)은 결제 인프라(Phase 0)에서 붙인다.
  const freePrice = loc === "ko" ? "₩0" : "$0";
  return (
    <main className="scroll screenIn"><div className="pad" style={{ display: "flex", flexDirection: "column" }}>
      <button className="link" style={{ alignSelf: "flex-start", color: "var(--muted)", marginBottom: 14 }} onClick={closePaywall}>{tr(loc, "pw_close")}</button>
      <h2>{tr(loc, "pw_using", { plan: state.plan === "pro" ? "pro" : "flash" })}</h2>
      <p className="lead" style={{ margin: "4px 0 16px" }}>{state.plan === "pro" ? tr(loc, "plan_unlimited") : tr(loc, "plan_free_left", { n: state.remaining })}</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="plancard">
          <div className="ph"><b>{tr(loc, "pw_free_card")}</b><span>{freePrice}</span></div>
          <ul><li>{tr(loc, "pw_free_1")}</li><li>{tr(loc, "pw_free_2")}</li><li>{tr(loc, "pw_free_3")}</li></ul>
        </div>
        <div className="plancard hi">
          <div className="ph"><b>{tr(loc, "pw_pro_card")}<span className="recopill">{tr(loc, "pw_reco")}</span></b></div>
          <div className="priceline"><span className="price">{tr(loc, "pw_pro_price")}</span><span className="taxcap">{tr(loc, "pw_pro_tax")}</span></div>
          <p className="planvalue">{tr(loc, "pw_pro_value")}</p>
          <ul><li>{tr(loc, "pw_pro_1")}</li><li>{tr(loc, "pw_pro_2")}</li><li>{tr(loc, "pw_pro_3")}</li><li>{tr(loc, "pw_pro_4")}</li><li>{tr(loc, "pw_pro_5")}</li></ul>
        </div>
      </div>
      <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={onPaywallCta}>{tr(loc, "pw_subscribe")}</button>
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

// 첫 방문 안내 팝업. 4스텝 — ①②③ 제품의 목적·이유(문장마다 사례 예시) ④ 사용방법. 백드롭/시작하기로 닫는다.
function Tutorial({ state, onClose }: { state: State; onClose: () => void }) {
  const loc = state.locale;
  const [step, setStep] = useState(0);
  const LAST = 3;
  const fields = tr(loc, "tut_p3_eg").split(",");
  const ref = useModalClose(onClose);
  return (
    <div className="modalBackdrop" onClick={onClose}>
      <div className="modalCard tut" ref={ref} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={tr(loc, "help")}>
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
