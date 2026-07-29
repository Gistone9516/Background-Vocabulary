// 어휘 생성 스트리밍의 전이 규칙. 순수 함수 하나.
// 누적 상한 검사가 여기 있다. v1은 스트림 콜백에서 최신 목록을 훔쳐 읽어 검사했다.

import { HIGH_RISK_CODE, type TermCard, type TermsCmd, type TermsConfig, type TermsEvent, type TermsState } from "./types.js";

const NONE: TermsCmd[] = [];

function liveRun(s: TermsState): number {
  return "runId" in s ? s.runId : 0;
}

function itemsOf(s: TermsState): TermCard[] {
  return "items" in s ? s.items : [];
}

// 카드 id. 스트리밍과 되살리기가 같은 형식을 써야 상세 캐시 키가 어긋나지 않는다.
function cardId(run: string | number, index: number): string {
  return `t${run}-${index}`;
}

export function reduce(s: TermsState, e: TermsEvent, cfg: TermsConfig): [TermsState, TermsCmd[]] {
  // 자기 스트림의 이벤트가 아니면 버린다. 이 대조가 한 곳에만 있다.
  if (e.t === "event" || e.t === "failed" || e.t === "watchdog") {
    if (e.runId !== liveRun(s)) return [s, NONE];
  }

  switch (e.t) {
    case "start": {
      const runId = liveRun(s) + 1;
      // 새 생성은 목록을 비우고 시작한다. 이어붙이기는 유지한다.
      const items = e.append ? itemsOf(s) : [];
      const cmds: TermsCmd[] = [];
      // 이전 스트림을 먼저 끊는다. 두 스트림이 같은 목록에 카드를 섞어 넣는 것을 막는다.
      if (s.phase === "streaming") cmds.push({ c: "abort", runId: s.runId });
      cmds.push({ c: "openStream", runId, input: e.input }, { c: "armWatchdog", runId });
      return [{ phase: "streaming", runId, items, append: e.append }, cmds];
    }

    case "event": {
      if (s.phase !== "streaming") return [s, NONE];

      if (e.ev.type === "term") {
        // 누적 상한에 닿으면 더 받지 않는다. 받아 놓고 버리면 그만큼 비용만 나간다.
        if (s.items.length >= cfg.maxTotal) {
          return [{ phase: "settled", items: s.items, reason: "capped" }, [{ c: "abort", runId: s.runId }]];
        }
        const card: TermCard = { ...e.ev.term, id: cardId(s.runId, s.items.length) };
        // 이벤트가 올 때마다 감시 시계를 되감는다.
        return [{ ...s, items: [...s.items, card] }, [{ c: "armWatchdog", runId: s.runId }]];
      }

      if (e.ev.type === "done") {
        const cmds: TermsCmd[] = [];
        // 이어붙이기는 이미 완료된 세션에 더한 것이라 완료 전이를 다시 하지 않는다.
        if (!s.append) cmds.push({ c: "completeSession", items: s.items });
        return [{ phase: "settled", items: s.items, reason: "done" }, cmds];
      }

      // error
      if (e.ev.code === HIGH_RISK_CODE) {
        // 생성 도중에도 2차 위험 게이트가 걸린다. 받은 것을 버리고 거부 화면으로 보낸다.
        return [{ phase: "settled", items: s.items, reason: "aborted" }, [{ c: "abort", runId: s.runId }, { c: "goRefusal" }]];
      }
      return [
        { phase: "failed", items: s.items, error: { kind: "server", status: 200, message: e.ev.message } },
        [{ c: "abort", runId: s.runId }],
      ];
    }

    case "failed": {
      if (s.phase !== "streaming") return [s, NONE];
      // 이미 받은 카드는 버리지 않는다. 부분 결과도 사용자에게는 가치가 있다.
      return [{ phase: "failed", items: s.items, error: e.error }, [{ c: "abort", runId: s.runId }]];
    }

    case "watchdog": {
      if (s.phase !== "streaming") return [s, NONE];
      // done도 error도 없이 조용히 멈춘 경우. 로딩을 영원히 돌리지 않는다.
      return [{ phase: "settled", items: s.items, reason: "aborted" }, [{ c: "abort", runId: s.runId }]];
    }

    // 이미 생성이 끝난 세션을 다시 여는 것이라 스트림도 완료 전이도 없다.
    // 완료 전이를 또 내면 세션이 다시 저장되어 updated_at만 흔들린다.
    case "restore":
      return [{ phase: "settled", items: e.items.map((t, i) => ({ ...t, id: cardId("r", i) })), reason: "done" }, NONE];

    case "leave": {
      if (s.phase === "idle") return [s, NONE];
      return [{ phase: "idle" }, [{ c: "abort", runId: liveRun(s) }]];
    }

    default:
      return [s, NONE];
  }
}

export const initialTerms: TermsState = { phase: "idle" };

// 화면이 쓰는 파생값.
export function termsOf(s: TermsState): TermCard[] {
  return itemsOf(s);
}
export function isStreaming(s: TermsState): boolean {
  return s.phase === "streaming";
}
