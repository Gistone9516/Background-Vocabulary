// 난이도 프리뷰 로딩. 같은 세션에 같은 답변이면 재사용하고, 화면을 떠나면 결과를 버린다.
//
// 호출부에서 요청 객체를 만들어 넘기지 않는다. 매 렌더마다 새 객체가 되어 effect가 끝없이 다시 도는
// 사고가 실제로 났다. 원시값만 의존성으로 두고 요청은 이 안에서 만든다. 그러면 그 실수가 불가능해진다.

import { useEffect, useRef, useState } from "react";
import type { PreviewIn, PreviewOut } from "@vock/shared";
import type { ApiPort } from "../../api/index.js";
import type { NarrowCtx } from "../narrow/index.js";
import { previewKeyOf, sameKey, type PreviewKey, type PreviewState } from "./types.js";

// 좁히기에서 사용자가 실제로 고른 라벨만. 난이도 신호("어려워요")는 답이 아니라 빠진다.
export function pickedLabels(ctx: NarrowCtx): string[] {
  return ctx.answers.flatMap((a) => (a.kind === "picks" ? a.labels : []));
}

export function usePreview(api: ApiPort, ctx: NarrowCtx | null): PreviewState {
  const [state, setState] = useState<PreviewState>({ phase: "loading" });
  // 캐시는 화면이 살아 있는 동안만 유지한다. 서버 저장은 S5에서 붙는다.
  const cache = useRef<{ key: PreviewKey; out: PreviewOut } | null>(null);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  const sessionId = ctx?.sessionId ?? "";
  // 문자열이라 렌더마다 값이 같으면 identity도 같다. 이것이 의존성 안정성의 핵심이다.
  const answersKey = ctx ? JSON.stringify(pickedLabels(ctx)) : "";

  useEffect(() => {
    const c = ctxRef.current;
    if (!c || !sessionId) return;

    const key = previewKeyOf(sessionId, JSON.parse(answersKey) as string[]);
    if (sameKey(cache.current?.key ?? null, key)) {
      setState({ phase: "ready", out: cache.current!.out });
      return;
    }

    const input: PreviewIn = {
      area: c.classifyOut.domain ?? "",
      job_type: c.classifyOut.job_type ?? [],
      history: pickedLabels(c),
      ...(c.topic ? { topic: c.topic } : {}),
    };

    const ac = new AbortController();
    setState({ phase: "loading" });
    api
      .preview(input, ac.signal)
      .then((out) => {
        // 화면을 떠났거나 새 프리뷰가 시작되면 도착한 결과를 버린다.
        if (ac.signal.aborted) return;
        cache.current = { key, out };
        setState({ phase: "ready", out });
      })
      .catch(() => {
        if (ac.signal.aborted) return;
        // 프리뷰는 보조 정보다. 실패해도 난이도 선택 자체는 막지 않는다.
        setState({ phase: "failed" });
      });
    return () => ac.abort();
  }, [api, sessionId, answersKey]);

  return state;
}
