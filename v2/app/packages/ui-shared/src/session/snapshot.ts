// 좁히기 맥락과 서버 세션 레코드 사이의 변환. 순수 함수라 서버 없이 왕복을 검증한다.
//
// 방향이 규칙이다(스펙 S-21): 저장할 때 스칼라 컬럼은 classify에서 파생하고,
// 재개할 때는 그 컬럼을 되읽지 않고 narrow.classify만 읽는다. 같은 값이 두 곳에 있을 때
// 어느 쪽이 정본인지 정하지 않으면 둘이 어긋난 뒤에야 알게 된다.

import type { NarrowSnap, SessionRec, Term } from "@vock/shared";
import type { NarrowCtx, Question } from "../screens/narrow/index.js";

// 좁히기 맥락 → 매 턴 저장할 스냅샷.
export function toSnapshot(ctx: NarrowCtx, current: Question | null): NarrowSnap {
  return {
    classify: ctx.classifyOut,
    question: current,
    answers: ctx.answers, // 그대로 넣는다. 변환하면 턴 수가 어긋난다(S-23)
    simplify: ctx.simplify,
    usedUndo: ctx.usedUndo,
    confidence: ctx.confidence,
  };
}

// 스냅샷 → 좁히기 맥락. 첫 질문은 classify가 갖고 있다(되돌리기가 돌아갈 지점).
export function fromSnapshot(rec: SessionRec, snap: NarrowSnap): NarrowCtx {
  return {
    sessionId: rec.session_id,
    topic: rec.topic,
    cond: rec.user_condition ?? "",
    classifyOut: snap.classify,
    firstQuestion: { question: snap.classify.question, choices: snap.classify.choices },
    answers: snap.answers,
    simplify: snap.simplify,
    usedUndo: snap.usedUndo,
    confidence: snap.confidence,
  };
}

// 서버에 보낼 세션. user_id는 서버가 토큰에서 정하므로 클라가 실어 보내지 않는다.
// 클라가 모르는 값을 지어내면 그 값이 정본인 척하게 된다.
export type SessionDraft = Omit<SessionRec, "user_id">;

export interface SnapshotArgs {
  ctx: NarrowCtx;
  // 진행 중이면 스냅샷, 생성이 끝났으면 null. 이 값이 목록의 "생성 중" 표시를 정한다.
  narrow: NarrowSnap | null;
  generated: Term[] | null;
  // 이미 서버에 있는 레코드. 전체 upsert라서 보내지 않은 필드는 지워진다(S-22).
  prev?: SessionRec | null;
  now: number;
}

// 보낼 레코드 전량. 부분 갱신이 아니므로 이전 값을 실어 보낸다(S-22).
export function toSessionRec(args: SnapshotArgs): SessionDraft {
  const { ctx, prev } = args;
  const c = ctx.classifyOut;
  return {
    session_id: ctx.sessionId,
    topic: ctx.topic,
    // 아래 네 줄이 색인이다. 정본은 narrow.classify이고 재개는 그쪽만 읽는다(S-21).
    area: c.domain || null,
    domain_risk: c.domain_risk,
    job_type: c.job_type,
    user_condition: ctx.cond || null,
    gap_type: prev?.gap_type ?? null,
    context_object: prev?.context_object ?? null,
    narrow: args.narrow,
    generated: args.generated ?? prev?.generated ?? null,
    // 프라이머는 /summarize가 채우는 서버 정본이다. 여기서 만들지 않고 있던 것을 지키기만 한다.
    primer: prev?.primer ?? null,
    project_id: prev?.project_id ?? null,
    pinned: prev?.pinned ?? false,
    deleted_at: null,
    created_at: prev?.created_at ?? args.now,
    updated_at: args.now,
  };
}
