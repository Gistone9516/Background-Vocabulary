// 스트림 명령을 실행한다. 요청과 감시 시계를 한 객체가 함께 소유해 정리 지점을 하나로 둔다.
// v1은 abortRef와 watchdog 타이머가 따로 있어 한쪽만 정리되는 경로가 있었다.

import type { ApiPort } from "../../api/index.js";
import { isApiError } from "../../api/index.js";
import type { TermCard, TermsCmd, TermsEvent } from "./types.js";

// done도 error도 없이 스트림이 멈추는 경우를 잡는 시간. 이벤트마다 되감는다.
const WATCHDOG_MS = 45_000;

export interface TermsEffects {
  api: ApiPort;
  send(e: TermsEvent): void;
  goRefusal(): void;
  completeSession(items: TermCard[]): void;
}

export class TermsRunner {
  private ac: AbortController | null = null;
  private runId = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly fx: TermsEffects) {}

  run(cmds: TermsCmd[]): void {
    for (const cmd of cmds) this.one(cmd);
  }

  dispose(): void {
    this.stop();
  }

  private stop(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.ac?.abort();
    this.ac = null;
  }

  private one(cmd: TermsCmd): void {
    switch (cmd.c) {
      case "openStream": {
        this.stop();
        this.runId = cmd.runId;
        const ac = new AbortController();
        this.ac = ac;
        void this.pump(cmd.runId, cmd.input, ac);
        return;
      }
      case "abort": {
        if (cmd.runId >= this.runId) this.stop();
        return;
      }
      case "armWatchdog": {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => this.fx.send({ t: "watchdog", runId: cmd.runId }), WATCHDOG_MS);
        return;
      }
      case "goRefusal":
        this.fx.goRefusal();
        return;
      case "completeSession":
        this.fx.completeSession(cmd.items);
        return;
    }
  }

  private async pump(runId: number, input: Parameters<ApiPort["recommendStream"]>[0], ac: AbortController): Promise<void> {
    try {
      for await (const ev of this.fx.api.recommendStream(input, ac.signal)) {
        if (ac.signal.aborted) return;
        this.fx.send({ t: "event", runId, ev });
      }
      // 서버가 done 없이 스트림을 닫는 경우. 감시 시계를 기다리지 않고 바로 정리한다.
      if (!ac.signal.aborted) this.fx.send({ t: "watchdog", runId });
    } catch (e) {
      if (ac.signal.aborted) return; // 우리가 끊은 것은 오류가 아니다
      this.fx.send({ t: "failed", runId, error: isApiError(e) ? e : { kind: "network" } });
    }
  }
}
