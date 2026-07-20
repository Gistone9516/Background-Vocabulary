// 인메모리 캐시 어댑터(local·mock 계층). TTL은 만료 시각으로 흉내낸다.
// 실 캐시(Upstash REST)는 C2에서 같은 CacheStore 포트로 구현한다.

import type { CacheStore } from "@vock/shared";

export class InMemoryCacheStore implements CacheStore {
  private readonly store = new Map<string, { val: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const hit = this.store.get(key);
    if (!hit) return null;
    if (Date.now() >= hit.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return hit.val;
  }

  async set(key: string, val: string, ttlSec: number): Promise<void> {
    // 계약: TTL 없는 키를 남기지 않는다(실 구현과 동일 가드).
    if (!ttlSec || ttlSec <= 0) {
      throw new Error("CacheStore.set: ttlSec는 양수여야 한다");
    }
    this.store.set(key, { val, expiresAt: Date.now() + ttlSec * 1000 });
  }
}
