// 프라이머가 읽는 네 값(C5-S3 V-19). 주제·조건·분야·작업유형.
//
// 두 곳에서 생산된다. 좁히기를 거쳐 왔으면 NarrowCtx 가, 히스토리에서 재개했으면 SessionRec 이
// 준다. 재개 쪽이 NarrowCtx 를 만들 수 없기 때문이다 — NarrowCtx 는 classifyOut 과 firstQuestion 을
// 요구하는데 둘 다 rec.narrow 안에 있고, 생성이 끝난 세션은 narrow 가 null 이다.
//
// 값이 두 벌이 되는 것이 아니다. **생산자가 둘이고 소비자가 하나**다 — 읽는 곳이 이 타입 하나뿐이라
// 두 경로가 갈라질 자리가 없다.

import type { JobType, SessionRec } from "@vock/shared";
import type { NarrowCtx } from "../screens/narrow/index.js";

export interface SessionMeta {
  sessionId: string | null;
  topic: string;
  cond: string;
  area: string;
  jobType: JobType[];
}

export const EMPTY_META: SessionMeta = { sessionId: null, topic: "", cond: "", area: "", jobType: [] };

export function metaFromCtx(ctx: NarrowCtx): SessionMeta {
  return {
    sessionId: ctx.sessionId,
    topic: ctx.topic,
    cond: ctx.cond,
    area: ctx.classifyOut.domain,
    jobType: ctx.classifyOut.job_type,
  };
}

// 재개로 들어온 세션. 기록의 최상위 필드에서 직접 뽑는다.
export function metaFromRec(rec: SessionRec): SessionMeta {
  return {
    sessionId: rec.session_id,
    topic: rec.topic,
    cond: rec.user_condition ?? "",
    area: rec.area ?? "",
    jobType: rec.job_type,
  };
}
