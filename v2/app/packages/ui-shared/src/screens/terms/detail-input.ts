// 카드와 세션 맥락에서 상세 요청을 만든다. 화면은 세션을 모르고, 셸은 상세 계약을 모른다.
// 맥락이 없을 때의 기본값도 여기 한 곳에만 둔다 — 호출부마다 두면 서로 달라진다.

import type { Prompt5In } from "@vock/shared";
import type { NarrowCtx } from "../narrow/index.js";
import type { TermCard } from "./types.js";

export function detailInputOf(card: TermCard, ctx: NarrowCtx | null): Prompt5In {
  return {
    term: card.term,
    kind: card.kind,
    area: ctx?.classifyOut.domain ?? "",
    job_type: ctx?.classifyOut.job_type ?? [],
    domain: ctx?.classifyOut.domain ?? "",
    topic: ctx?.topic ?? "",
    locale: ctx?.classifyOut.search_locale ?? "en",
    // 연결 턴에서 고른 방향. 없으면 필드를 아예 넣지 않는다 —
    // 빈 문자열을 보내면 프롬프트가 "연결이 있다"고 읽는다.
    ...(ctx?.connection ? { connection_hint: ctx.connection } : {}),
  };
}
