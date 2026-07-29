// 여정 배선. 어느 화면을 보여줄지만 정하고 화면 내부 규칙은 ui-shared가 가진다.
// 좁히기와 어휘 생성의 전이 규칙은 여기 없다. 상태 기계가 통째로 ui-shared에 있다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppShell,
  AuthButton,
  DifficultyScreen,
  EntryScreen,
  HttpApiClient,
  KeptScreen,
  NarrowScreen,
  TermsScreen,
  useAuth,
  emptyKept,
  isKept as isKeptIn,
  keptList,
  toggleKeep,
  tr,
  useDetail,
  useNarrow,
  usePreview,
  useProjects,
  useSessionSync,
  limitsFor,
  resumeTarget,
  usePrimer,
  useTerms,
  detailInputOf,
  type Difficulty,
  type DoneReason,
  type KeptMap,
  type NarrowConfig,
  type NarrowCtx,
  type TermCard,
} from "@vock/ui-shared";
import type { ClientLimits, RecommendInput, Tier } from "@vock/shared";
import { localTokenStore } from "./auth-storage.js";
import { sidebarSlots } from "./Sidebar.js";

// 개발 중에는 vite 프록시를 지나 로컬 서버로 간다. 배포 주소는 빌드 시 주입한다.
const BASE_URL = import.meta.env.VITE_API_BASE ?? "/api";

// /config를 아직 못 받았을 때 쓰는 값. 서버가 정본이고 이건 첫 화면이 멈추지 않게 하는 임시값이다.
const FALLBACK: NarrowConfig = { narrowMin: 3, narrowMax: 3 };
const FALLBACK_MAX_TOTAL = 8;

type Journey =
  | { at: "entry"; notice?: "weekly" }
  | { at: "narrow" }
  | { at: "difficulty"; ctx: NarrowCtx; reason: DoneReason }
  | { at: "terms" }
  | { at: "kept" }
  | { at: "refusal" };

// 종료 사유 고지(S2 D-9). 사용자가 직접 끊은 경우와 내부 오류는 알리지 않는다.
function doneNotice(reason: DoneReason): string | null {
  if (reason === "enough") return tr("done_enough");
  if (reason === "exhausted") return tr("done_exhausted");
  return null;
}

export function App() {
  // 토큰 저장은 셸이 정한다. ui-shared는 저장 방식을 모른다.
  const tokens = useMemo(() => localTokenStore(), []);
  const api = useMemo<HttpApiClient>(() => {
    // onUnauthorized가 자기 자신을 부르므로 타입을 명시해 추론 순환을 끊는다.
    // 클로저는 생성 이후에만 실행되니 런타임에는 문제가 없다.
    const client: HttpApiClient = new HttpApiClient({
      baseUrl: BASE_URL,
      getAccessToken: () => tokens.read()?.access ?? null,
      // 401 한 번에 한해 재발급하고 원 요청을 한 번만 다시 보낸다(S5a A-7).
      onUnauthorized: async (): Promise<string | null> => {
        const held = tokens.read();
        if (!held) return null;
        const next = await client.refresh(held.refresh).catch(() => null);
        if (!next) {
          tokens.clear();
          return null;
        }
        tokens.write({ access: next.access_token, refresh: next.refresh_token });
        return next.access_token;
      },
    });
    return client;
  }, [tokens]);
  const [limits, setLimits] = useState<ClientLimits | null>(null);
  const [journey, setJourney] = useState<Journey>({ at: "entry" });

  useEffect(() => {
    const ac = new AbortController();
    api.config(ac.signal).then(setLimits).catch(() => setLimits(null));
    return () => ac.abort();
  }, [api]);

  const onRefusal = useCallback(() => setJourney({ at: "refusal" }), []);
  const onEntryNotice = useCallback((notice: "weekly") => setJourney({ at: "entry", notice }), []);
  const onHandoff = useCallback(
    (ctx: NarrowCtx, reason: DoneReason) => setJourney({ at: "difficulty", ctx, reason }),
    []
  );

  // 로그인. client_id가 없으면(콘솔 등록 전) 버튼 자체가 뜨지 않는다(S5a A-2).
  const auth = useAuth({
    auth: api,
    tokens,
    clientId: limits?.googleClientId ?? null,
    redirectUri: typeof location === "undefined" ? "" : location.origin + location.pathname,
  });

  // 한도는 로그인한 사용자의 티어로 고른다(B-4 narrowMax[tier], R-5 maxTotal[tier]).
  // .free를 여기서 직접 읽으면 유료 사용자가 무료 한도를 받는다.
  const tier: Tier = auth.state.phase === "signed_in" ? auth.state.user.tier : "free";
  const tierLimits = useMemo(() => limitsFor(limits, tier), [limits, tier]);
  const base: NarrowConfig = { narrowMin: tierLimits.narrowMin, narrowMax: tierLimits.narrowMax };
  const termsCfg = useMemo(() => ({ maxTotal: tierLimits.maxTotal }), [tierLimits]);

  // 로그인 여부. 저장은 로그인한 사용자만 한다(스펙 S-1).
  const signedIn = auth.state.phase === "signed_in";
  const projects = useProjects({ api, enabled: signedIn });
  const sync = useSessionSync({ api, enabled: signedIn, projectId: projects.selected });

  // 연결 턴은 선택한 프로젝트에 담은 어휘가 있을 때만 켠다(S-11).
  const cfg = useMemo<NarrowConfig>(() => ({ ...base, connect: projects.canConnect }), [base, projects.canConnect]);

  const narrow = useNarrow({
    api,
    cfg,
    relate: projects.relate,
    onHandoff,
    onRefusal,
    onEntryNotice,
    // 저장 시점은 상태 기계가 정한다. 여기서는 옮기기만 한다.
    saveSnapshot: sync.saveSnapshot,
  });
  const terms = useTerms({
    api,
    cfg: termsCfg,
    onRefusal,
    // 생성이 끝나면 narrow를 지워 목록의 "생성 중"을 푼다(S-5).
    onComplete: (items) => {
      const c = lastCtx.current;
      if (c) sync.completeSession(c, items);
    },
  });
  const detail = useDetail(api);
  const primer = usePrimer(api);

  // 담기는 화면 상태로만 유지한다. 서버 저장은 로그인 UI와 함께 S5에서 붙는다.
  const [kept, setKept] = useState<KeptMap>(emptyKept);
  const toggleKept = useCallback(
    (t: TermCard) => {
      // 화면을 먼저 바꾼다. 서버 실패가 담기를 되돌리지 않는다(S-7).
      setKept((prev) => {
        const next = toggleKeep(prev, t);
        const sid = lastCtx.current?.sessionId;
        if (sid) sync.syncKeep(sid, t, next.size > prev.size);
        return next;
      });
    },
    [sync]
  );
  const keptTerms = useMemo(() => keptList(kept), [kept]);

  // 상세 요청은 카드와 세션 맥락에서 만든다. 화면은 세션을 모른다.
  const lastCtx = useRef<NarrowCtx | null>(null);
  if (journey.at === "difficulty") lastCtx.current = journey.ctx;
  const detailInput = useCallback((card: TermCard) => detailInputOf(card, lastCtx.current), []);

  // 난이도 화면에 들어가면 깊이별 대표 어휘를 미리 부른다. 한도에 집계되지 않는다.
  // 요청 조립은 훅 안에서 한다. 여기서 만들면 매 렌더마다 새 객체가 되어 effect가 끝없이 돈다.
  const preview = usePreview(api, journey.at === "difficulty" ? journey.ctx : null);

  const submit = useCallback(
    (input: string, condition: string) => {
      setJourney({ at: "narrow" });
      narrow.send({ t: "submit", sessionId: crypto.randomUUID(), raw: input, cond: condition });
    },
    [narrow]
  );

  const pickDifficulty = useCallback(
    (d: Difficulty) => {
      if (journey.at !== "difficulty") return;
      const c = journey.ctx;
      const input: RecommendInput = {
        // 서버가 이 세션의 프로젝트를 찾아 이미 담은 어휘를 exclude에 병합한다(S-24).
        // 클라가 exclude를 채우지 않는다 — 채우면 그것을 빠뜨린 호출부마다 중복이 나온다.
        session_id: c.sessionId,
        area: c.classifyOut.domain ?? "",
        job_type: c.classifyOut.job_type ?? [],
        domain: c.classifyOut.domain ?? "",
        topic: c.topic,
        locale: c.classifyOut.search_locale,
        domain_risk: c.classifyOut.domain_risk,
        difficulty: d, // 추천 전체가 이 깊이로 생성된다(Prompt3In)
        ...(c.cond ? { user_condition: c.cond } : {}),
      };
      setJourney({ at: "terms" });
      terms.send({ t: "start", input, append: false });
    },
    [journey, terms]
  );

  // 세션 재개. /classify를 다시 부르지 않는다(S-6). 어디로 갈지는 순수 함수가 정한다.
  const resume = useCallback(
    async (id: string) => {
      const target = resumeTarget(await sync.load(id).catch(() => null));
      if (target.to === "none") return;
      if (target.to === "terms") {
        setJourney({ at: "terms" });
        terms.send({ t: "restore", items: target.items ?? [] });
        return;
      }
      lastCtx.current = target.ctx;
      if (target.to === "narrow") {
        setJourney({ at: "narrow" });
        narrow.send({ t: "resume", ctx: target.ctx, question: target.question });
      } else {
        setJourney({ at: "difficulty", ctx: target.ctx, reason: "user_jump" });
      }
    },
    [narrow, sync, terms]
  );

  const home = useCallback(() => {
    narrow.send({ t: "leave" });
    terms.send({ t: "leave" });
    setJourney({ at: "entry" });
  }, [narrow, terms]);

  const slots = sidebarSlots({ sync, projects, onOpenSession: resume });

  return (
    <AppShell
      sessions={slots.sessions}
      projects={slots.projects}
      footer={
        <AuthButton state={auth.state} available={auth.available} onSignIn={auth.signIn} onSignOut={auth.signOut} />
      }
    >
      {journey.at === "entry" ? (
        <EntryScreen onSubmit={submit} notice={journey.notice === "weekly" ? tr("weekly_exhausted") : null} />
      ) : null}

      {journey.at === "narrow" ? <NarrowScreen state={narrow.state} cfg={cfg} send={narrow.send} /> : null}

      {journey.at === "difficulty" ? (
        <DifficultyScreen preview={preview} notice={doneNotice(journey.reason)} onPick={pickDifficulty} />
      ) : null}

      {journey.at === "terms" ? (
        <TermsScreen
          state={terms.state}
          detail={detail.state}
          detailInputOf={detailInput}
          onToggleDetail={detail.toggle}
          onRetryDetail={detail.retry}
          isKept={(term) => isKeptIn(kept, term)}
          keptCount={kept.size}
          onToggleKeep={toggleKept}
          onViewKept={() => setJourney({ at: "kept" })}
        />
      ) : null}

      {journey.at === "kept" ? (
        <KeptScreen
          kept={keptTerms}
          topic={lastCtx.current?.topic ?? ""}
          condition={lastCtx.current?.cond ?? ""}
          primerState={primer.state}
          onRefine={() =>
            primer.request({
              area: lastCtx.current?.classifyOut.domain ?? "",
              jobType: lastCtx.current?.classifyOut.job_type ?? [],
              kept: keptTerms,
              condition: lastCtx.current?.cond ?? "",
            })
          }
          onBackToTerms={() => setJourney({ at: "terms" })}
          onHome={home}
          onRemove={(t) => setKept((prev) => toggleKeep(prev, t))}
        />
      ) : null}

      {journey.at === "refusal" ? (
        <main className="scroll pad screenIn">
          <h2>{"안전상 직접 다루지 않는 주제예요"}</h2>
          <button className="btn btn-ghost" style={{ marginTop: "1rem" }} onClick={home}>
            {"처음으로"}
          </button>
        </main>
      ) : null}
    </AppShell>
  );
}
