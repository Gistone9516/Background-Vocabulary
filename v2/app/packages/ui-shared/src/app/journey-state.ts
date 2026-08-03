// 여정의 위치 타입과 그 부속 순수 함수. journey.tsx(배선)에서 갈라냈다 — 정의와 배선은 다른 책임이고,
// 배선 파일이 300행 상한에 반복해서 닿았다.

import type { OutputLocale } from "@vock/shared";
import type { DoneReason, NarrowCtx } from "../screens/narrow/index.js";
import { trIn } from "../i18n/strings.js";

export type Journey =
  | { at: "entry"; notice?: "weekly" }
  | { at: "narrow" }
  | { at: "difficulty"; ctx: NarrowCtx; reason: DoneReason }
  | { at: "terms" }
  | { at: "kept" }
  | { at: "primer" } // 세션의 종착(C5-S2). 되돌아가는 문이 아니라 나가는 문이다
  | { at: "refusal" };

// 종료 사유 고지(S2 D-9). 사용자가 직접 끊은 경우와 내부 오류는 알리지 않는다.
// 컴포넌트 밖이라 useTr()이 닿지 않는다. 로케일을 인자로 받는 것이 trIn이 존재하는 이유다.
export function doneNotice(locale: OutputLocale, reason: DoneReason): string | null {
  if (reason === "enough") return trIn(locale, "done_enough");
  if (reason === "exhausted") return trIn(locale, "done_exhausted");
  return null;
}
