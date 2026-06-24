// Upstash Redis REST 캐시 구현. fetch만 쓰므로 Workers와 Lambda 모두에서 동작한다.
// TTL 없는 키는 Upstash에서 사라지지 않아 스토리지를 오염시키므로 set에서 ttlSec 검증을 한다.

import type { CacheStore } from "@sidetab/shared";

// Upstash REST 응답 형태. 명령에 따라 result는 문자열이거나 null이다.
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

  // Upstash REST에 명령 배열을 POST한다.
  // 명령 배열 방식은 값에 특수문자나 슬래시가 있어도 URL 인코딩 문제를 피할 수 있다.
  private async command(cmd: string[]): Promise<UpstashResponse> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
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
    // TTL이 없거나 0 이하면 Upstash에서 키가 영구 잔류한다. 반드시 유효한 TTL이 있어야 한다.
    if (ttlSec === undefined || ttlSec === null || ttlSec <= 0) {
      throw new Error(
        "UpstashCacheStore.set에는 양수 ttlSec가 필요하다. TTL 없는 키는 스토리지를 오염시킨다."
      );
    }

    await this.command(["SET", key, val, "EX", String(ttlSec)]);
  }
}
