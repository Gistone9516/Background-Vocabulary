// 카드 상세의 전이 규칙. 순수 함수 하나.
//
// 무료 열람 횟수를 클라가 세지 않는다. 서버 카운터와 두 벌이 되면 반드시 어긋난다(코드규약 8절).
// 소진은 서버가 402로 알려 주고 그때 안내한다.

import type { Prompt5In, Prompt5Out } from "@vock/shared";
import type { ApiError } from "../../api/index.js";

export type DetailState =
  | { phase: "closed" }
  | { phase: "loading"; id: string; runId: number }
  | { phase: "open"; id: string; out: Prompt5Out }
  | { phase: "locked"; id: string; message: string }
  | { phase: "failed"; id: string; runId: number; error: ApiError };

export type DetailEvent =
  | { t: "toggle"; id: string; input: Prompt5In }
  | { t: "loaded"; runId: number; id: string; out: Prompt5Out }
  | { t: "failed"; runId: number; id: string; error: ApiError }
  | { t: "retry"; input: Prompt5In }
  | { t: "close" };

export type DetailCmd =
  | { c: "callDetail"; runId: number; id: string; input: Prompt5In }
  | { c: "abort"; runId: number }
  | { c: "revealCard"; id: string };

// 받아 온 상세는 다시 부르지 않는다. 접었다 펴는 것에 과금하지 않는다.
export type DetailCache = Record<string, Prompt5Out>;

const NONE: DetailCmd[] = [];

function liveRun(s: DetailState): number {
  return "runId" in s ? s.runId : 0;
}

function openedId(s: DetailState): string | null {
  return "id" in s ? s.id : null;
}

export function reduce(
  s: DetailState,
  e: DetailEvent,
  cache: DetailCache
): [DetailState, DetailCmd[], DetailCache] {
  if (e.t === "loaded" || e.t === "failed") {
    if (e.runId !== liveRun(s)) return [s, NONE, cache];
  }

  switch (e.t) {
    case "toggle": {
      // 열려 있는 카드를 다시 누르면 접는다.
      if (openedId(s) === e.id && s.phase !== "loading") return [{ phase: "closed" }, NONE, cache];

      const cmds: DetailCmd[] = [];
      // 다른 카드가 로딩 중이었으면 그 요청을 끊는다.
      if (s.phase === "loading") cmds.push({ c: "abort", runId: s.runId });

      const hit = cache[e.id];
      if (hit) {
        cmds.push({ c: "revealCard", id: e.id });
        return [{ phase: "open", id: e.id, out: hit }, cmds, cache];
      }
      const runId = liveRun(s) + 1;
      cmds.push({ c: "callDetail", runId, id: e.id, input: e.input });
      return [{ phase: "loading", id: e.id, runId }, cmds, cache];
    }

    case "loaded": {
      if (s.phase !== "loading" || s.id !== e.id) return [s, NONE, cache];
      return [{ phase: "open", id: e.id, out: e.out }, [{ c: "revealCard", id: e.id }], { ...cache, [e.id]: e.out }];
    }

    case "failed": {
      if (s.phase !== "loading" || s.id !== e.id) return [s, NONE, cache];
      // 무료 열람 소진과 pro 전용은 재시도할 일이 아니라 안내할 일이다.
      if (e.error.kind === "weekly_exhausted" || e.error.kind === "pro_only") {
        return [{ phase: "locked", id: e.id, message: e.error.message }, NONE, cache];
      }
      return [{ phase: "failed", id: e.id, runId: s.runId, error: e.error }, NONE, cache];
    }

    case "retry": {
      if (s.phase !== "failed") return [s, NONE, cache];
      const runId = s.runId + 1;
      return [{ phase: "loading", id: s.id, runId }, [{ c: "callDetail", runId, id: s.id, input: e.input }], cache];
    }

    case "close": {
      const cmds: DetailCmd[] = s.phase === "loading" ? [{ c: "abort", runId: s.runId }] : NONE;
      return [{ phase: "closed" }, cmds, cache];
    }

    default:
      return [s, NONE, cache];
  }
}

export const initialDetail: DetailState = { phase: "closed" };
