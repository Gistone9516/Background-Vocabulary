// 상태 기계가 내놓은 명령을 실제로 실행한다. 기계는 여기서만 바깥과 만난다.
// 취소는 runId별 AbortController로 관리한다. 늦게 온 응답을 버리는 것과 별개로 실제로 끊어야
// 서버가 하던 일을 멈춘다(스펙 D-6). local은 즉시 끊기고 aws Lambda는 서버 측이 안 멈춘다(SoT 5절).

import type { ApiPort } from "../../api/index.js";
import { isApiError, type ApiError } from "../../api/index.js";
import type { RelateOut } from "@vock/shared";
import type { NarrowCmd, NarrowCtx, NarrowEvent, DoneReason, Question } from "./types.js";

export interface NarrowEffects {
  api: ApiPort;
  send(e: NarrowEvent): void;
  saveSnapshot(ctx: NarrowCtx, question: Question | null): void;
  goRefusal(): void;
  goEntryWithNotice(notice: "weekly"): void;
  goHandoff(ctx: NarrowCtx, reason: DoneReason): void;
  // 연결 턴 조회. 프로젝트와 누적 자산을 아는 쪽이 입력을 만든다 —
  // 기계도 러너도 프로젝트를 몰라야 한다. 실패는 null로 돌려준다(S-12).
  relate?(ctx: NarrowCtx): Promise<RelateOut | null>;
}

function asApiError(e: unknown): ApiError {
  if (isApiError(e)) return e;
  return { kind: "network" };
}

export class NarrowRunner {
  private readonly inflight = new Map<number, AbortController>();

  constructor(private readonly fx: NarrowEffects) {}

  run(cmds: NarrowCmd[]): void {
    for (const cmd of cmds) this.one(cmd);
  }

  // 화면이 사라질 때 남은 요청을 전부 끊는다.
  dispose(): void {
    for (const [, ac] of this.inflight) ac.abort();
    this.inflight.clear();
  }

  private one(cmd: NarrowCmd): void {
    switch (cmd.c) {
      case "callClassify":
        void this.call(cmd.runId, (signal) => this.fx.api.classify(cmd.input, signal), (out, runId) =>
          this.fx.send({ t: "classified", runId, out })
        );
        return;
      case "callNext":
        void this.call(cmd.runId, (signal) => this.fx.api.next(cmd.input, signal), (out, runId) =>
          this.fx.send({ t: "advanced", runId, out })
        );
        return;
      case "callRelate": {
        const ask = this.fx.relate;
        // 연결 턴은 실패해도 좁히기를 멈추지 않는다. 그래서 공용 call을 쓰지 않는다 —
        // 공용 call은 실패를 failed 이벤트로 올려 화면을 재시도 상태로 만든다.
        if (!ask) {
          this.fx.send({ t: "related", runId: cmd.runId, out: null });
          return;
        }
        void ask(cmd.ctx)
          .then((out) => this.fx.send({ t: "related", runId: cmd.runId, out }))
          .catch(() => this.fx.send({ t: "related", runId: cmd.runId, out: null }));
        return;
      }
      case "abort": {
        for (const [id, ac] of this.inflight) {
          if (id <= cmd.runId) {
            ac.abort();
            this.inflight.delete(id);
          }
        }
        return;
      }
      case "saveSnapshot":
        this.fx.saveSnapshot(cmd.ctx, cmd.question);
        return;
      case "goRefusal":
        this.fx.goRefusal();
        return;
      case "goEntryWithNotice":
        this.fx.goEntryWithNotice(cmd.notice);
        return;
      case "goHandoff":
        this.fx.goHandoff(cmd.ctx, cmd.reason);
        return;
    }
  }

  private async call<T>(
    runId: number,
    invoke: (signal: AbortSignal) => Promise<T>,
    ok: (out: T, runId: number) => void
  ): Promise<void> {
    const ac = new AbortController();
    this.inflight.set(runId, ac);
    try {
      const out = await invoke(ac.signal);
      ok(out, runId);
    } catch (e) {
      // 우리가 끊은 것은 실패가 아니다. 기계는 이미 다음 상태로 갔다.
      if (ac.signal.aborted) return;
      this.fx.send({ t: "failed", runId, error: asApiError(e) });
    } finally {
      this.inflight.delete(runId);
    }
  }
}
