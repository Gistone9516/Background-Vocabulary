// 상태 기계와 러너를 React에 붙인다. 여기에는 전이 규칙이 없다. 배선만 있다.
// 최신 상태를 ref로 훔쳐 읽지 않는다. 전이는 항상 리듀서 안에서 일어나므로 stale 상태가 생길 수 없다.

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { ApiPort } from "../../api/index.js";
import { initialNarrow, reduce } from "./machine.js";
import { NarrowRunner, type NarrowEffects } from "./runner.js";
import type { RelateOut } from "@vock/shared";
import type { DoneReason, NarrowCmd, NarrowConfig, NarrowCtx, NarrowEvent, NarrowState, Question } from "./types.js";

interface Wrapped {
  state: NarrowState;
  cmds: NarrowCmd[];
  seq: number;
}

export interface UseNarrowOptions {
  api: ApiPort;
  cfg: NarrowConfig;
  saveSnapshot?(ctx: NarrowCtx, question: Question | null): void;
  // 연결 턴 조회. cfg.connect가 켜졌을 때만 불린다.
  relate?(ctx: NarrowCtx): Promise<RelateOut | null>;
  onRefusal(): void;
  onEntryNotice(notice: "weekly"): void;
  onHandoff(ctx: NarrowCtx, reason: DoneReason): void;
}

export function useNarrow(opts: UseNarrowOptions) {
  const cfgRef = useRef(opts.cfg);
  cfgRef.current = opts.cfg;

  // 리듀서는 순수하다. 명령은 상태에 실어 두고 실행은 효과에서 한다.
  const step = useCallback((w: Wrapped, e: NarrowEvent): Wrapped => {
    const [state, cmds] = reduce(w.state, e, cfgRef.current);
    return { state, cmds, seq: w.seq + 1 };
  }, []);

  const [w, dispatch] = useReducer(step, { state: initialNarrow, cmds: [], seq: 0 });

  const optsRef = useRef(opts);
  optsRef.current = opts;

  const runner = useMemo(() => {
    const fx: NarrowEffects = {
      api: opts.api,
      send: (e) => dispatch(e),
      saveSnapshot: (ctx, question) => optsRef.current.saveSnapshot?.(ctx, question),
      relate: (ctx) => optsRef.current.relate?.(ctx) ?? Promise.resolve(null),
      goRefusal: () => optsRef.current.onRefusal(),
      goEntryWithNotice: (n) => optsRef.current.onEntryNotice(n),
      goHandoff: (ctx, reason) => optsRef.current.onHandoff(ctx, reason),
    };
    return new NarrowRunner(fx);
    // api 구현이 바뀌면 러너를 새로 만든다. 나머지 콜백은 ref 경유라 재생성이 필요 없다.
  }, [opts.api]);

  // 같은 seq를 두 번 실행하지 않는다. 개발 모드의 이중 마운트에서 요청이 두 번 나가는 것을 막는다.
  const lastRun = useRef(0);
  useEffect(() => {
    if (w.seq === lastRun.current) return;
    lastRun.current = w.seq;
    if (w.cmds.length) runner.run(w.cmds);
  }, [w.seq, w.cmds, runner]);

  useEffect(() => () => runner.dispose(), [runner]);

  const send = useCallback((e: NarrowEvent) => dispatch(e), []);
  return { state: w.state, send };
}
