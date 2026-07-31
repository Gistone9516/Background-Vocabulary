// 상세 기계를 React에 붙인다. 배선만 있고 전이 규칙은 없다.

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { Prompt5In } from "@vock/shared";
import type { ApiPort } from "../../api/index.js";
import { isApiError } from "../../api/index.js";
import { initialDetail, reduce, type DetailCache, type DetailCmd, type DetailEvent, type DetailState } from "./detail-machine.js";

interface Wrapped {
  state: DetailState;
  cache: DetailCache;
  cmds: DetailCmd[];
  seq: number;
}

// sessionIdOf는 함수로 받는다 — 세션은 여정 도중 바뀌므로 값으로 받으면 effect가 옛 세션을 보낸다.
export function useDetail(api: ApiPort, sessionIdOf: () => string | null) {
  // 매 렌더 새 클로저가 와도 effect 의존성을 흔들지 않도록 ref로 받는다.
  const sidRef = useRef(sessionIdOf);
  sidRef.current = sessionIdOf;

  const step = useCallback((w: Wrapped, e: DetailEvent): Wrapped => {
    const [state, cmds, cache] = reduce(w.state, e, w.cache);
    return { state, cache, cmds, seq: w.seq + 1 };
  }, []);

  const [w, dispatch] = useReducer(step, { state: initialDetail, cache: {}, cmds: [], seq: 0 });

  const inflight = useRef<AbortController | null>(null);
  const lastRun = useRef(0);

  useEffect(() => {
    if (w.seq === lastRun.current) return;
    lastRun.current = w.seq;

    for (const cmd of w.cmds) {
      if (cmd.c === "abort") {
        inflight.current?.abort();
        inflight.current = null;
      } else if (cmd.c === "callDetail") {
        inflight.current?.abort();
        const ac = new AbortController();
        inflight.current = ac;
        api
          .detail(cmd.input, sidRef.current(), ac.signal)
          .then((out) => {
            if (ac.signal.aborted) return;
            dispatch({ t: "loaded", runId: cmd.runId, id: cmd.id, out });
          })
          .catch((err) => {
            if (ac.signal.aborted) return;
            dispatch({ t: "failed", runId: cmd.runId, id: cmd.id, error: isApiError(err) ? err : { kind: "network" } });
          });
      } else if (cmd.c === "revealCard") {
        // 펼친 내용이 화면 밖에 생기면 보이게 옮긴다. 시간 상수를 두지 않고 브라우저에 맡긴다.
        const el = document.getElementById(`card-${cmd.id}`);
        el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [w.seq, w.cmds, api]);

  useEffect(() => () => inflight.current?.abort(), []);

  const toggle = useCallback((id: string, input: Prompt5In) => dispatch({ t: "toggle", id, input }), []);
  const retry = useCallback((input: Prompt5In) => dispatch({ t: "retry", input }), []);
  const close = useCallback(() => dispatch({ t: "close" }), []);

  return useMemo(() => ({ state: w.state, toggle, retry, close }), [w.state, toggle, retry, close]);
}
