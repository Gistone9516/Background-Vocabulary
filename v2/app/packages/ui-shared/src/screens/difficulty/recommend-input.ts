// 난이도 선택에서 어휘 생성 요청을 만든다. 화면은 세션 계약을 모르고, 여정은 조립을 모른다.
// screens/terms/detail-input.ts와 같은 자리다 — 계약 조립은 배선이 아니라서 배선 파일에 두지 않는다.

import type { RecommendInput } from "@vock/shared";
import type { NarrowCtx } from "../narrow/index.js";
import type { Difficulty } from "./types.js";

export function recommendInputOf(ctx: NarrowCtx, difficulty: Difficulty): RecommendInput {
  return {
    // 서버가 이 세션의 프로젝트를 찾아 이미 담은 어휘를 exclude에 병합한다(S-24).
    // 클라가 exclude를 채우지 않는다 — 채우면 그것을 빠뜨린 호출부마다 중복이 나온다.
    session_id: ctx.sessionId,
    area: ctx.classifyOut.domain ?? "",
    job_type: ctx.classifyOut.job_type ?? [],
    domain: ctx.classifyOut.domain ?? "",
    topic: ctx.topic,
    locale: ctx.classifyOut.search_locale,
    domain_risk: ctx.classifyOut.domain_risk,
    difficulty, // 추천 전체가 이 깊이로 생성된다(Prompt3In)
    ...(ctx.cond ? { user_condition: ctx.cond } : {}),
    // 첨부 맥락(FR-901). v1 선례대로 classify·next와 같은 텍스트를 recommend에도 싣는다.
    ...(ctx.context ? { context_object: ctx.context } : {}),
  };
}
