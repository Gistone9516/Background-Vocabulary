// AI 정리 호출과 캐시. 실패해도 기본 정리는 그대로 남는다(스펙 P-7).

import { useCallback, useRef, useState } from "react";
import type { Prompt4In, PrimerDoc, Term } from "@vock/shared";
import type { ApiPort } from "../../api/index.js";
import { primerFailure, primerKey, type PrimerState } from "./primer.js";

export function usePrimer(api: ApiPort) {
  const [state, setState] = useState<PrimerState>({ phase: "idle" });
  const cache = useRef(new Map<string, PrimerDoc>());
  const inflight = useRef<AbortController | null>(null);

  const request = useCallback(
    (args: { area: string; jobType: Prompt4In["job_type"]; kept: Term[]; condition: string }) => {
      if (args.kept.length === 0) return;
      const key = primerKey(args.kept, args.condition);
      const hit = cache.current.get(key);
      if (hit) {
        setState({ phase: "ready", doc: hit });
        return;
      }

      inflight.current?.abort();
      const ac = new AbortController();
      inflight.current = ac;
      setState({ phase: "loading" });

      const input: Prompt4In = {
        area: args.area,
        job_type: args.jobType,
        vocab: args.kept.map((t) => t.term),
        ...(args.condition ? { user_condition: args.condition } : {}),
      };

      api
        .summarize(input, ac.signal)
        .then((doc) => {
          if (ac.signal.aborted) return;
          cache.current.set(key, doc);
          setState({ phase: "ready", doc });
        })
        .catch((e) => {
          if (ac.signal.aborted) return;
          setState(primerFailure(e));
        });
    },
    [api]
  );

  return { state, request };
}
