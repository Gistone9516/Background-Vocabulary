// Upstash REST 카운터(CounterStore 포트). v1의 UsageCounter·GlobalDailyCap·UpstashCounter 통합.
// hit=INCR + 최초(=1)만 EXPIRE, get=GET→number. 게이팅 미들웨어가 키를 조립한다.

import type { CounterStore } from "@vock/shared";

interface UpstashResponse {
  result: string | number | null;
}

export class UpstashCounterStore implements CounterStore {
  private readonly url: string;
  private readonly token: string;
  constructor(opts: { url: string; token: string }) {
    this.url = opts.url.replace(/\/$/, "");
    this.token = opts.token;
  }

  private async command(cmd: string[]): Promise<UpstashResponse> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cmd),
    });
    if (!res.ok) throw new Error(`Upstash REST 오류 ${res.status}`);
    return (await res.json()) as UpstashResponse;
  }

  async hit(key: string, ttlSec: number): Promise<number> {
    const incr = await this.command(["INCR", key]);
    const count = Number(incr.result) || 0;
    if (count === 1) {
      // 최초 키에만 TTL을 건다(이미 TTL 있는 키에 재-EXPIRE는 초기화이므로 1회만). 실패는 카운트를 막지 않는다.
      await this.command(["EXPIRE", key, String(ttlSec)]).catch(() => {});
    }
    return count;
  }

  async get(key: string): Promise<number> {
    const r = await this.command(["GET", key]);
    return r.result == null ? 0 : Number(r.result) || 0;
  }
}
