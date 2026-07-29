// 저장된 세션을 어디로 되살릴지 정한다. 순수 함수라 화면 없이 검증된다.
//
// 판정 근거는 저장된 상태 하나뿐이다(스펙 S-20): narrow가 없으면 생성까지 끝난 세션이고,
// narrow.question이 없으면 좁히기는 끝났고 난이도 선택 앞이다. 별도 단계 플래그를 두면
// 그 플래그와 질문 유무가 어긋날 수 있다.

import type { SessionRec } from "@vock/shared";
import type { NarrowCtx, Question } from "../screens/narrow/index.js";
import { fromSnapshot } from "./snapshot.js";

export type Resume =
  | { to: "narrow"; ctx: NarrowCtx; question: Question }
  | { to: "difficulty"; ctx: NarrowCtx }
  | { to: "terms"; items: SessionRec["generated"] }
  | { to: "none" };

export function resumeTarget(rec: SessionRec | null): Resume {
  if (!rec) return { to: "none" };
  if (rec.narrow) {
    const ctx = fromSnapshot(rec, rec.narrow);
    return rec.narrow.question ? { to: "narrow", ctx, question: rec.narrow.question } : { to: "difficulty", ctx };
  }
  // 담기 0개여도 생성 목록은 보존된다(FR-702).
  if (rec.generated && rec.generated.length > 0) return { to: "terms", items: rec.generated };
  return { to: "none" };
}
