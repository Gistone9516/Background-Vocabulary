// 히스토리 항목에서 세션을 되살리는 배선(C5-S3). 여정 배선과 다른 책임이라 파일을 나눈다 —
// journey.tsx 는 "지금 어느 화면인가"를 정하고, 여기는 "저장된 기록을 화면 상태로 어떻게 펴는가"를 정한다.
//
// 세 가지를 한 자리에서 한다. 기록을 읽고, 프라이머가 읽는 네 값을 채우고, 담기를 복원한다.
// 흩어 놓으면 하나만 빠뜨려도 컴파일이 통과한다 — 실제로 담기 복원이 빠져 있던 동안
// 재개한 세션에서 담은 어휘로 가는 링크가 아예 안 떴다(V-19).

import type { MutableRefObject } from "react";
import type { SessionRec } from "@vock/shared";
import type { ApiPort } from "../api/index.js";
import type { Journey } from "./journey-state.js";
import type { KeptMap } from "../screens/kept/index.js";
import { keptFromAssets } from "../screens/kept/index.js";
import type { NarrowCtx, Question } from "../screens/narrow/index.js";
import { resumeTarget } from "../session/index.js";
import { metaFromRec, type SessionMeta } from "../session/session-meta.js";

export interface ResumeIntoDeps {
  api: ApiPort;
  load(id: string): Promise<SessionRec | null>;
  setJourney(j: Journey): void;
  setKept(k: KeptMap): void;
  lastCtx: MutableRefObject<NarrowCtx | null>;
  meta: MutableRefObject<SessionMeta>;
  restoreTerms(items: SessionRec["generated"]): void;
  resumeNarrow(ctx: NarrowCtx, question: Question): void;
}

export async function resumeInto(id: string, d: ResumeIntoDeps): Promise<void> {
  const rec = await d.load(id).catch(() => null);
  const target = resumeTarget(rec);
  if (target.to === "none") return;

  if (rec) {
    // 프라이머가 읽는 네 값을 기록에서 채운다(V-19). NarrowCtx 는 만들 수 없다 —
    // classifyOut·firstQuestion 이 narrow 안에 있는데 생성이 끝난 세션은 narrow 가 null 이다.
    d.meta.current = metaFromRec(rec);
    // 담기 복원(V-19). 서버가 정본이고 화면 상태를 여기서 받는다.
    // 실패해도 여정을 멈추지 않는다 — 담은 어휘 링크가 안 뜰 뿐이다.
    void d.api
      .listSessionAssets(id)
      .then((assets) => d.setKept(keptFromAssets(assets)))
      .catch(() => {});
  }

  if (target.to === "terms") {
    d.setJourney({ at: "terms" });
    d.restoreTerms(target.items ?? []);
    return;
  }
  d.lastCtx.current = target.ctx;
  if (target.to === "narrow") {
    d.setJourney({ at: "narrow" });
    d.resumeNarrow(target.ctx, target.question);
  } else {
    d.setJourney({ at: "difficulty", ctx: target.ctx, reason: "user_jump" });
  }
}
