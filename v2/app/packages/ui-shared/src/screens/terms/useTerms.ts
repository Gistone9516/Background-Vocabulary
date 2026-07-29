// 어휘 생성 기계와 러너를 React에 붙인다. 배선만 있고 전이 규칙은 없다.

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { ApiPort } from "../../api/index.js";
import { initialTerms, reduce } from "./machine.js";
import { TermsRunner, type TermsEffects } from "./runner.js";
import type { TermCard, TermsCmd, TermsConfig, TermsEvent, TermsState } from "./types.js";

interface Wrapped {
  state: TermsState;
  cmds: TermsCmd[];
  seq: number;
}

export interface UseTermsOptions {
  api: ApiPort;
  cfg: TermsConfig;
  onRefusal(): void;
  onComplete?(items: TermCard[]): void;
}

export function useTerms(opts: UseTermsOptions) {
  const cfgRef = useRef(opts.cfg);
  cfgRef.current = opts.cfg;

  const step = useCallback((w: Wrapped, e: TermsEvent): Wrapped => {
    const [state, cmds] = reduce(w.state, e, cfgRef.current);
    return { state, cmds, seq: w.seq + 1 };
  }, []);

  const [w, dispatch] = useReducer(step, { state: initialTerms, cmds: [], seq: 0 });

  const optsRef = useRef(opts);
  optsRef.current = opts;

  const runner = useMemo(() => {
    const fx: TermsEffects = {
      api: opts.api,
      send: (e) => dispatch(e),
      goRefusal: () => optsRef.current.onRefusal(),
      completeSession: (items) => optsRef.current.onComplete?.(items),
    };
    return new TermsRunner(fx);
  }, [opts.api]);

  const lastRun = useRef(0);
  useEffect(() => {
    if (w.seq === lastRun.current) return;
    lastRun.current = w.seq;
    if (w.cmds.length) runner.run(w.cmds);
  }, [w.seq, w.cmds, runner]);

  useEffect(() => () => runner.dispose(), [runner]);

  const send = useCallback((e: TermsEvent) => dispatch(e), []);
  return { state: w.state, send };
}
