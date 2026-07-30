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
import { NarrowScreen, useNarrow } from "../screens/narrow/index.js";
import type { DoneReason, NarrowConfig, NarrowCtx } from "../screens/narrow/index.js";
import { DifficultyScreen, usePreview } from "../screens/difficulty/index.js";
import type { Difficulty } from "../screens/difficulty/index.js";
import { TermsScreen, detailInputOf, useDetail, useTerms } from "../screens/terms/index.js";
import type { TermCard } from "../screens/terms/index.js";
import { KeptScreen, emptyKept, isKept as isKeptIn, keptList, toggleKeep, usePrimer } from "../screens/kept/index.js";
import type { KeptMap } from "../screens/kept/index.js";
import { trIn } from "./../i18n/strings.js";
import { LocaleProvider, useOutputLocale, useTr } from "../i18n/locale.js";
import { limitsFor } from "../api/index.js";
import { useProjects, useSessionSync, resumeTarget } from "../session/index.js";
import type { ClientLimits, OutputLocale, RecommendInput, Tier } from "@vock/shared";

type Journey =
  | { at: "entry"; notice?: "weekly" }
  | { at: "narrow" }
  | { at: "difficulty"; ctx: NarrowCtx; reason: DoneReason }
  | { at: "terms" }
  | { at: "kept" }
  | { at: "refusal" };

// 종료 사유 고지(S2 D-9). 사용자가 직접 끊은 경우와 내부 오류는 알리지 않는다.
// 컴포넌트 밖이라 useTr()이 닿지 않는다. 로케일을 인자로 받는 것이 trIn이 존재하는 이유다.
function doneNotice(locale: OutputLocale, reason: DoneReason): string | null {
  if (reason === "enough") return trIn(locale, "done_enough");
  if (reason === "exhausted") return trIn(locale, "done_exhausted");
  return null;
}

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
  const { api, tokens } = deps;
  const tr = useTr();
  const { locale: loc, setLocale } = useOutputLocale();
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

  // 로그인. 능력(deps.auth)이 null이면 훅이 available=false를 돌려 버튼 자체가 뜨지 않는다 —
  // client_id 미등록 시 버튼이 없는 것(S5a A-2)과 같은 강등 경로를 태운다. 화면 분기가 아니다.
  const auth = useAuth({
    auth: api,
    tokens,
    clientId: limits?.googleClientId ?? null,
    flow: deps.auth,
  });

  // 언어 설정 동기화(FR-952, C4 S2 §1-4). 정본=서버.
  // 로그인 직후 1회: 서버 locale이 로컬을 덮는다. 이후 로그인 중 변경: 서버에 반영한다.
  // 실패는 삼키되 경고 1줄 — 화면은 로컬 값을 유지하고, 다음 로그인 때 서버 값이 이긴다(§1-4 트레이드오프).
  const serverLocale = useRef<OutputLocale | null>(null);
  useEffect(() => {
    if (auth.state.phase !== "signed_in") {
      serverLocale.current = null;
      return;
    }
    if (serverLocale.current === null) {
      serverLocale.current = auth.state.user.locale;
      if (auth.state.user.locale !== loc) setLocale(auth.state.user.locale);
      return;
    }
    if (loc !== serverLocale.current) {
      serverLocale.current = loc;
      api.updateLocale(loc).catch(() => console.warn("언어 설정 서버 반영 실패 — 다음 로그인 때 서버 값이 이긴다"));
    }
  }, [auth.state, loc, setLocale, api]);

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
        <EntryScreen onSubmit={submit} notice={journey.notice === "weekly" ? tr("weekly_exhausted") : null} />
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
          <h2>{tr("refusal_title")}</h2>
          <button className="btn btn-ghost" style={{ marginTop: "1rem" }} onClick={home}>
            {tr("refusal_home")}
          </button>
        </main>
      ) : null}
    </AppShell>
  );
}
