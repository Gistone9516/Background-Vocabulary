// 여정 배선. 어느 화면을 보여줄지만 정하고 화면 내부 규칙은 ui-shared가 가진다.
// 좁히기와 어휘 생성의 전이 규칙은 여기 없다. 상태 기계가 통째로 ui-shared에 있다.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppShell,
  DifficultyScreen,
  EntryScreen,
  HttpApiClient,
  NarrowScreen,
  TermsScreen,
  tr,
  useNarrow,
  usePreview,
  useTerms,
  type Difficulty,
  type DoneReason,
  type NarrowConfig,
  type NarrowCtx,
} from "@vock/ui-shared";
import type { ClientLimits, RecommendInput } from "@vock/shared";

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
  | { at: "refusal" };

// 종료 사유 고지(S2 D-9). 사용자가 직접 끊은 경우와 내부 오류는 알리지 않는다.
function doneNotice(reason: DoneReason): string | null {
  if (reason === "enough") return tr("done_enough");
  if (reason === "exhausted") return tr("done_exhausted");
  return null;
}

export function App() {
  const api = useMemo(() => new HttpApiClient({ baseUrl: BASE_URL }), []);
  const [limits, setLimits] = useState<ClientLimits | null>(null);
  const [journey, setJourney] = useState<Journey>({ at: "entry" });

  useEffect(() => {
    const ac = new AbortController();
    api.config(ac.signal).then(setLimits).catch(() => setLimits(null));
    return () => ac.abort();
  }, [api]);

  // 티어가 붙는 것은 S4다. 그전까지는 free 기준으로 본다.
  const cfg: NarrowConfig = limits ? { narrowMin: limits.narrowMin, narrowMax: limits.narrowMax.free } : FALLBACK;
  const termsCfg = useMemo(() => ({ maxTotal: limits?.maxTotal.free ?? FALLBACK_MAX_TOTAL }), [limits]);

  const onRefusal = useCallback(() => setJourney({ at: "refusal" }), []);
  const onEntryNotice = useCallback((notice: "weekly") => setJourney({ at: "entry", notice }), []);
  const onHandoff = useCallback(
    (ctx: NarrowCtx, reason: DoneReason) => setJourney({ at: "difficulty", ctx, reason }),
    []
  );

  const narrow = useNarrow({ api, cfg, onHandoff, onRefusal, onEntryNotice });
  const terms = useTerms({ api, cfg: termsCfg, onRefusal });

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
        area: c.classifyOut.domain ?? "",
        job_type: c.classifyOut.job_type ?? [],
        domain: c.classifyOut.domain ?? "",
        topic: c.topic,
        locale: c.classifyOut.search_locale,
        domain_risk: c.classifyOut.domain_risk,
        ...(c.cond ? { user_condition: c.cond } : {}),
      };
      setJourney({ at: "terms" });
      terms.send({ t: "start", input, append: false });
      void d; // 난이도는 프롬프트 계약에 아직 필드가 없다. S3b 상세와 함께 정리한다.
    },
    [journey, terms]
  );

  const home = useCallback(() => {
    narrow.send({ t: "leave" });
    terms.send({ t: "leave" });
    setJourney({ at: "entry" });
  }, [narrow, terms]);

  return (
    <AppShell>
      {journey.at === "entry" ? (
        <>
          {journey.notice === "weekly" ? (
            <p className="listnote" style={{ textAlign: "center" }}>{tr("done_exhausted")}</p>
          ) : null}
          <EntryScreen onSubmit={submit} />
        </>
      ) : null}

      {journey.at === "narrow" ? <NarrowScreen state={narrow.state} cfg={cfg} send={narrow.send} /> : null}

      {journey.at === "difficulty" ? (
        <>
          {doneNotice(journey.reason) ? (
            <p className="listnote" style={{ textAlign: "center" }}>{doneNotice(journey.reason)}</p>
          ) : null}
          <DifficultyScreen preview={preview} onPick={pickDifficulty} />
        </>
      ) : null}

      {journey.at === "terms" ? <TermsScreen state={terms.state} /> : null}

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
