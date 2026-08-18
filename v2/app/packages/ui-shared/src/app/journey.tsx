// 여정 배선. 어느 화면을 보여줄지만 정하고 화면 내부 규칙은 각 화면 모듈이 가진다.
// 좁히기와 어휘 생성의 전이 규칙은 여기 없다. 상태 기계가 통째로 screens/에 있다.
//
// C4 S1에서 web/src/App.tsx를 그대로 올렸다(이동이지 수정이 아니다 — DS-2). 올린 이유:
// web/deps.ts의 약속("데스크톱 셸은 이 파일만 바꿔 끼운다")은 여정이 web 안에 있는 한 지킬 수
// 없다. 형제 참조(desktop → web)는 게이트가 막고, 복사하면 여정이 두 벌이 되어 D-12(기획
// 동일선상)가 코드 차원에서 깨진다. 이동하며 바뀐 것은 두 가지뿐이다:
// ① import가 배럴(@vock/ui-shared)에서 상대경로로, ② redirectUri 인라인 계산이 deps.auth
// (능력 모델)로. 나머지 줄은 App.tsx 그대로다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "./AppShell.js";
import { sidebarSlots } from "./sidebar-slots.js";
import type { ShellDeps } from "./shell-deps.js";
import { AuthButton, useAuth } from "../screens/auth/index.js";
import { EntryScreen } from "../screens/EntryScreen.js";
import { RefusalScreen } from "../screens/RefusalScreen.js";
import { doneNotice, type Journey } from "./journey-state.js";
import { NarrowScreen, useNarrow } from "../screens/narrow/index.js";
import type { DoneReason, NarrowConfig, NarrowCtx } from "../screens/narrow/index.js";
import { DifficultyScreen, recommendInputOf, usePreview } from "../screens/difficulty/index.js";
import type { Difficulty } from "../screens/difficulty/index.js";
import { TermsScreen, detailInputOf, useDetail, useTerms } from "../screens/terms/index.js";
import type { TermCard } from "../screens/terms/index.js";
import { KeptScreen, emptyKept, isKept as isKeptIn, keptList, toggleKeep, usePrimer } from "../screens/kept/index.js";
import { PrimerScreen, usePrimerSources } from "../screens/primer/index.js";
import type { KeptMap } from "../screens/kept/index.js";
import { trIn } from "./../i18n/strings.js";
import { LocaleProvider, useOutputLocale, useTr } from "../i18n/locale.js";
import { limitsFor } from "../api/index.js";
import { useShellBridge } from "./shell-bridge.js";
import { useEntryTracks } from "./entry-slot.js";
import { resumeInto } from "./resume-into.js";
import { useProjects, useSessionSync } from "../session/index.js";
import { EMPTY_META, metaFromCtx, type SessionMeta } from "../session/session-meta.js";
import type { ClientLimits, Tier } from "@vock/shared";

// 로케일 훅은 제공자 안에서만 유효하다. 그래서 제공자를 두는 컴포넌트와 그 훅을 쓰는 컴포넌트를
// 가른다 — 한 컴포넌트가 자기 return 안에서 제공자를 만들고 자기 본문에서 useTr을 부르면,
// 제공자가 아직 없는 상태로 훅이 돌아 useOutputLocale이 예외를 던진다. 타입은 이것을 못 잡는다.
export function VockApp({ deps }: { deps: ShellDeps }) {
  return (
    <LocaleProvider store={deps.locale}>
      <AppBody deps={deps} />
    </LocaleProvider>
  );
}

function AppBody({ deps }: { deps: ShellDeps }) {
  const { tokens } = deps;
  const tr = useTr();
  const { locale: loc } = useOutputLocale();
  const [limits, setLimits] = useState<ClientLimits | null>(null);
  const [journey, setJourney] = useState<Journey>({ at: "entry" });

  useEffect(() => {
    const ac = new AbortController();
    // 원본 클라이언트로 부른다 — /config는 캐시 경로가 아니고, 다리는 auth 상태가 필요해 아래에 있다.
    deps.api.config(ac.signal).then(setLimits).catch(() => setLimits(null));
    return () => ac.abort();
  }, [deps.api]);

  const onRefusal = useCallback(() => setJourney({ at: "refusal" }), []);
  const onEntryNotice = useCallback((notice: "weekly") => setJourney({ at: "entry", notice }), []);
  const onHandoff = useCallback(
    (ctx: NarrowCtx, reason: DoneReason) => setJourney({ at: "difficulty", ctx, reason }),
    []
  );

  // 로그인. 능력(deps.auth)이 null이면 훅이 available=false를 돌려 버튼 자체가 뜨지 않는다 —
  // client_id 미등록 시 버튼이 없는 것(S5a A-2)과 같은 강등 경로를 태운다. 화면 분기가 아니다.
  // auth에는 **원본** 클라이언트를 준다: 데코레이터는 ApiPort(읽기 캐시)지 AuthPort가 아니고,
  // 로그인·재발급이 캐시를 지나면 안 된다 — 타입이 이 분리를 강제한다.
  const auth = useAuth({
    auth: deps.api,
    tokens,
    clientId: limits?.googleClientId ?? null,
    flow: deps.auth,
  });

  // 셸 능력과의 다리(C4 S2·S3): 캐시 데코레이터·언어 정본 동기화·로그아웃 캐시 삭제(shell-bridge.ts).
  const { api, offline } = useShellBridge(deps, auth.state);

  // 한도는 로그인한 사용자의 티어로 고른다(B-4 narrowMax[tier], R-5 maxTotal[tier]).
  // .free를 여기서 직접 읽으면 유료 사용자가 무료 한도를 받는다.
  const tier: Tier = auth.state.phase === "signed_in" ? auth.state.user.tier : "free";
  const tierLimits = useMemo(() => limitsFor(limits, tier), [limits, tier]);
  // 탈출구 라벨은 문구를 아는 쪽이 넘긴다(S-34).
  const base: NarrowConfig = {
    narrowMin: tierLimits.narrowMin,
    narrowMax: tierLimits.narrowMax,
    noRelationLabel: tr("relate_none"),
  };
  const termsCfg = useMemo(() => ({ maxTotal: tierLimits.maxTotal }), [tierLimits]);

  // 로그인 여부. 저장은 로그인한 사용자만 한다(스펙 S-1).
  const signedIn = auth.state.phase === "signed_in";

  // 로그아웃 = 캐시 삭제(DS3-5). 같은 기기의 다음 사용자에게 남의 목록이 보이면
  // 소유권 규칙(PUT 409 횡령 방지)의 클라이언트 판 위반이다.
  const wasSignedIn = useRef(false);
  useEffect(() => {
    if (wasSignedIn.current && !signedIn) void deps.offline?.clear().catch(() => {});
    wasSignedIn.current = signedIn;
  }, [signedIn, deps.offline]);
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
  const detail = useDetail(api, () => lastCtx.current?.sessionId ?? null);
  const primer = usePrimer(api);

  // 담기는 화면 상태로만 유지한다.
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
  // 프라이머가 읽는 네 값(V-19). 생산자는 둘, 소비자는 하나다.
  const meta = useRef<SessionMeta>(EMPTY_META);
  if (journey.at === "difficulty") {
    lastCtx.current = journey.ctx;
    meta.current = metaFromCtx(journey.ctx);
  }
  const detailInput = useCallback((card: TermCard) => detailInputOf(card, lastCtx.current), []);

  // 종착 화면의 재료. 조회 목록과 자산은 그 화면에 있을 때만 부른다.
  const sources = usePrimerSources({
    api,
    sessionId: meta.current.sessionId,
    kept: keptTerms,
    generated: "items" in terms.state ? terms.state.items : [],
    projectId: projects.selected,
    enabled: journey.at === "primer",
  });

  // 난이도 화면에 들어가면 깊이별 대표 어휘를 미리 부른다. 한도에 집계되지 않는다.
  // 요청 조립은 훅 안에서 한다. 여기서 만들면 매 렌더마다 새 객체가 되어 effect가 끝없이 돈다.
  const preview = usePreview(api, journey.at === "difficulty" ? journey.ctx : null);

  const submit = useCallback(
    (input: string, condition: string, context?: string) => {
      setJourney({ at: "narrow" });
      narrow.send({ t: "submit", sessionId: crypto.randomUUID(), raw: input, cond: condition, ...(context ? { context } : {}) });
    },
    [narrow]
  );

  const pickDifficulty = useCallback(
    (d: Difficulty) => {
      if (journey.at !== "difficulty") return;
      setJourney({ at: "terms" });
      terms.send({ t: "start", input: recommendInputOf(journey.ctx, d), append: false });
    },
    [journey, terms]
  );

  // 세션 재개. /classify를 다시 부르지 않는다(S-6). 어디로 갈지는 순수 함수가 정한다.
  const resume = useCallback(
    (id: string) =>
      resumeInto(id, {
        api,
        load: sync.load,
        setJourney,
        setKept,
        lastCtx,
        meta,
        restoreTerms: (items) => terms.send({ t: "restore", items: items ?? [] }),
        resumeNarrow: (ctx, question) => narrow.send({ t: "resume", ctx, question }),
      }),
    [api, narrow, sync, terms]
  );

  // 진입 화면 트랙에 들어갈 내용(C5-S3). 무엇을 넣을지는 entry-slot 이 정한다.
  const entryTracks = useEntryTracks({
    api,
    signedIn,
    atEntry: journey.at === "entry",
    projectId: projects.selected,
    firstListed: sync.list.items[0]?.session_id ?? null,
    onOpen: resume,
  });

  const home = useCallback(() => {
    narrow.send({ t: "leave" });
    terms.send({ t: "leave" });
    setJourney({ at: "entry" });
  }, [narrow, terms]);

  const slots = sidebarSlots({
    sync,
    projects,
    onOpenSession: resume,
    // 고지는 로그인 상태에서만 뜻이 있다 — 비로그인은 off 문구가 이미 자리를 차지한다(DS3-1).
    offlineNotice: offline && signedIn ? tr("offline_notice") : null,
  });

  // 로케일 제공자가 셸 바깥이다. 헤더의 언어 선택과 진입 화면의 예시 칩이 같은 값을 읽는다.
  return (
    <AppShell
      sessions={slots.sessions}
      projects={slots.projects}
      footer={
        <AuthButton state={auth.state} available={auth.available} onSignIn={auth.signIn} onSignOut={auth.signOut} />
      }
    >
      {journey.at === "entry" ? (
        <EntryScreen
          onSubmit={submit}
          notice={journey.notice === "weekly" ? tr("weekly_exhausted") : null}
          // 잠금 표시와 서버 판정이 같은 값(attachRequiresPro)에서 나온다(DS4-3).
          attachLocked={(limits?.attachRequiresPro ?? true) && tier !== "paid"}
          {...(limits ? { maxContextChars: limits.maxContextChars } : {})}
          tracks={entryTracks}
        />
      ) : null}

      {journey.at === "narrow" ? <NarrowScreen state={narrow.state} cfg={cfg} send={narrow.send} /> : null}

      {journey.at === "difficulty" ? (
        <DifficultyScreen preview={preview} notice={doneNotice(loc, journey.reason)} onPick={pickDifficulty} />
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
          onToPrimer={() => setJourney({ at: "primer" })}
          onBackToTerms={() => setJourney({ at: "terms" })}
          onHome={home}
          onRemove={(t) => setKept((prev) => toggleKeep(prev, t))}
        />
      ) : null}

      {journey.at === "primer" ? (
        <PrimerScreen
          session={sources.session}
          assets={sources.assets}
          selection={sources.selection}
          onToggle={sources.onToggle}
          topic={meta.current.topic}
          condition={meta.current.cond}
          primerState={primer.state}
          onRefine={() =>
            primer.request({
              area: meta.current.area,
              jobType: meta.current.jobType,
              kept: keptTerms,
              condition: meta.current.cond,
            })
          }
          onBackToKept={() => setJourney({ at: "kept" })}
          onHome={home}
          // 스코프 3은 마인드맵 슬라이스가 꽂는다(T-4). 지금은 절이 뜨지 않는다.
          mapPanel={null}
        />
      ) : null}

      {journey.at === "refusal" ? <RefusalScreen onHome={home} /> : null}
    </AppShell>
  );
}
