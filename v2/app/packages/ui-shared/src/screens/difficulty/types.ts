// 난이도 화면 타입과 프리뷰 캐시 판정.

import type { PreviewOut } from "@vock/shared";

export type Difficulty = "기초" | "중급" | "심화";

export type PreviewState =
  | { phase: "loading" }
  | { phase: "ready"; out: PreviewOut }
  | { phase: "failed" };

// 프리뷰 재사용 키. 같은 세션에 같은 답변이면 다시 부르지 않는다.
// 새로고침이나 재진입마다 부르면 비용만 나간다(스펙 P-2).
export interface PreviewKey {
  sessionId: string;
  answers: string;
}

export function previewKeyOf(sessionId: string, labels: string[]): PreviewKey {
  return { sessionId, answers: JSON.stringify(labels) };
}

export function sameKey(a: PreviewKey | null, b: PreviewKey): boolean {
  return !!a && a.sessionId === b.sessionId && a.answers === b.answers;
}
