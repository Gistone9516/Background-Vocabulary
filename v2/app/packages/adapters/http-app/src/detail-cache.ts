// 펼친 상세의 읽기-통과 캐시 배선(FR-401, 스펙 E-3~E-6).
// 게이팅과 라우트는 여기서 만든 함수 두 개만 받는다 — 영속 계층 전체에 결합되지 않는다
// (mergeProjectExclude가 Repositories 대신 질문 하나만 받는 것과 같은 이유).

import type { JobType, Locale, Prompt5In, Prompt5Out, Repositories } from "@vock/shared";
import { detailInputKey, normTerm } from "@vock/shared";

// 라우트 본문에서 키 입력을 뽑는다. 본문은 신뢰할 수 없는 JSON이라 필드마다 좁힌다 —
// 형태가 어긋난 요청에서 키 조립이 던지면 캐시가 아니라 열람 자체가 실패한다.
function keyInput(body: Record<string, unknown>): Prompt5In {
  const locale: Locale = body.locale === "ko" ? "ko" : "en";
  return {
    term: String(body.term ?? ""),
    kind: String(body.kind ?? ""),
    area: String(body.area ?? ""),
    job_type: Array.isArray(body.job_type) ? (body.job_type as JobType[]) : [],
    domain: String(body.domain ?? ""),
    topic: String(body.topic ?? ""),
    locale,
    ...(typeof body.connection_hint === "string" ? { connection_hint: body.connection_hint } : {}),
  };
}

export interface DetailCache {
  find(userId: string | null, body: Record<string, unknown>): Promise<Prompt5Out | null>;
  save(userId: string | null, body: Record<string, unknown>, out: Prompt5Out): Promise<void>;
}

// 비로그인은 서버 저장 경계 밖이다 — CRUD도 401이고, details.user_id가 users를 참조하므로
// 익명 행은 애초에 만들 수 없다. 그래서 캐시는 로그인 사용자에게만 작동한다.
export function buildDetailCache(repos: Repositories): DetailCache {
  return {
    async find(userId, body) {
      if (!userId) return null;
      const rec = await repos.details.find(userId, await detailInputKey(keyInput(body)));
      return rec ? rec.body : null;
    },
    async save(userId, body, out) {
      if (!userId) return;
      await repos.details.save({
        user_id: userId,
        // 클라가 함께 싣는다. 없으면 빈 문자열로 남고, 세션 스코프 목록에서만 빠진다.
        session_id: typeof body.session_id === "string" ? body.session_id : "",
        term_norm: normTerm(String(body.term ?? "")),
        input_key: await detailInputKey(keyInput(body)),
        body: out,
        created_at: Date.now(),
      });
    },
  };
}
