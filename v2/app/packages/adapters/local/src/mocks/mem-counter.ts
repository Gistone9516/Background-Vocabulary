// 인메모리 카운터(local·mock 계층). TTL은 만료 시각으로 흉내낸다.
// 실 카운터(Upstash REST INCR/EXPIRE)는 C2.4에서 같은 CounterStore 포트로 구현한다.

import type { CounterStore } from "@vock/shared";

export class InMemoryCounterStore implements CounterStore {
  private readonly store = new Map<string, { n: number; expiresAt: number }>();

  private live(key: string): { n: number; expiresAt: number } | null {
    const e = this.store.get(key);
    if (e && Date.now() < e.expiresAt) return e;
    if (e) this.store.delete(key);
    return null;
  }

  async hit(key: string, ttlSec: number): Promise<number> {
    const e = this.live(key);
    if (e) {
      e.n += 1;
      return e.n;
    }
    this.store.set(key, { n: 1, expiresAt: Date.now() + ttlSec * 1000 });
    return 1;
  }

  async get(key: string): Promise<number> {
    return this.live(key)?.n ?? 0;
  }
}
