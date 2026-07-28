// 여정 배선. 어느 화면을 보여줄지만 정하고 화면 내부 규칙은 ui-shared가 가진다.
// 좁히기의 전이 규칙은 여기 없다. 상태 기계가 통째로 ui-shared에 있다.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AppShell,
  EntryScreen,
  HandoffScreen,
  HttpApiClient,
  NarrowScreen,
  tr,
  useNarrow,
  type DoneReason,
  type NarrowConfig,
  type NarrowCtx,
} from "@vock/ui-shared";
import type { ClientLimits } from "@vock/shared";

// 개발 중에는 vite 프록시를 지나 로컬 서버로 간다. 배포 주소는 빌드 시 주입한다.
const BASE_URL = import.meta.env.VITE_API_BASE ?? "/api";

// /config를 아직 못 받았을 때 쓰는 값. 서버가 정본이고 이건 첫 화면이 멈추지 않게 하는 임시값이다.
const FALLBACK: NarrowConfig = { narrowMin: 3, narrowMax: 3 };

type Journey =
  | { at: "entry"; notice?: "weekly" }
  | { at: "narrow" }
  | { at: "handoff"; ctx: NarrowCtx; reason: DoneReason }
  | { at: "refusal" };

export function App() {
  const api = useMemo(() => new HttpApiClient({ baseUrl: BASE_URL }), []);
  const [limits, setLimits] = useState<ClientLimits | null>(null);
  const [journey, setJourney] = useState<Journey>({ at: "entry" });

  // 한도는 서버가 정본이다. 좁히기 종료 시점을 클라 상수로 두면 서버와 어긋난다.
  useEffect(() => {
    const ac = new AbortController();
    api.config(ac.signal).then(setLimits).catch(() => setLimits(null));
    return () => ac.abort();
  }, [api]);

  // 티어가 붙는 것은 S4다. 그전까지는 free 기준으로 본다.
  const cfg: NarrowConfig = limits
    ? { narrowMin: limits.narrowMin, narrowMax: limits.narrowMax.free }
    : FALLBACK;

  const onHandoff = useCallback((ctx: NarrowCtx, reason: DoneReason) => setJourney({ at: "handoff", ctx, reason }), []);
  const onRefusal = useCallback(() => setJourney({ at: "refusal" }), []);
  const onEntryNotice = useCallback((notice: "weekly") => setJourney({ at: "entry", notice }), []);

  const narrow = useNarrow({ api, cfg, onHandoff, onRefusal, onEntryNotice });

  const submit = useCallback(
    (input: string, condition: string) => {
      setJourney({ at: "narrow" });
      narrow.send({ t: "submit", sessionId: crypto.randomUUID(), raw: input, cond: condition });
    },
    [narrow]
  );

  // 화면을 떠나면 남은 요청을 실제로 끊는다(스펙 D-6).
  const home = useCallback(() => {
    narrow.send({ t: "leave" });
    setJourney({ at: "entry" });
  }, [narrow]);

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

      {journey.at === "handoff" ? <HandoffScreen ctx={journey.ctx} reason={journey.reason} /> : null}

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
