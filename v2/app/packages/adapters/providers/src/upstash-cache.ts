// Upstash Redis REST 캐시. fetch만 쓰므로 Lambda·로컬 모두에서 동작. TTL 없는 키 방지(set에서 검증). v1 이식.

import type { CacheStore } from "@vock/shared";

interface UpstashResponse {
  result: string | null;
}

export class UpstashCacheStore implements CacheStore {
  private readonly url: string;
  private readonly token: string;
  constructor(opts: { url: string; token: string }) {
    this.url = opts.url;
    this.token = opts.token;
  }

  // 명령 배열 방식(값의 특수문자·슬래시 URL 인코딩 문제 회피).
  private async command(cmd: string[]): Promise<UpstashResponse> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cmd),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "(응답 본문 없음)");
      throw new Error(`Upstash REST 오류 ${res.status}: ${text}`);
    }
    return (await res.json()) as UpstashResponse;
  }

  async get(key: string): Promise<string | null> {
    const resp = await this.command(["GET", key]);
    return resp.result;
  }

  async set(key: string, val: string, ttlSec: number): Promise<void> {
    if (ttlSec === undefined || ttlSec === null || ttlSec <= 0) {
      throw new Error("UpstashCacheStore.set에는 양수 ttlSec가 필요하다. TTL 없는 키는 스토리지를 오염시킨다.");
    }
    await this.command(["SET", key, val, "EX", String(ttlSec)]);
  }
}
