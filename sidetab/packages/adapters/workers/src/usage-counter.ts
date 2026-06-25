// Upstash REST를 이용한 주간 사용량 카운터.
// 키 형식: sub:{userId}:week
// 처음 INCR 호출 시 주간 만료(7일)를 설정한다.
// userId 파생 전략은 구현계획 12장(설치 UUID + Workers 바인딩 검증)에서 확정 예정.
// 지금은 헤더를 신뢰하는 방식으로 구현하고, 서버 측 바인딩은 후속 작업(Tier3)으로 남긴다.

export const FREE_WEEKLY_LIMIT = 7;
const WEEK_TTL_SEC = 7 * 24 * 60 * 60;
const DAY_TTL_SEC = 24 * 60 * 60;

// 빌드 단계 비용 폭주를 막는 전역 일일 캡. 티어·사용자 무관하게 비싼 호출(recommend·detail·summarize)을
// 하루 단위로 합산해 상한을 넘으면 차단한다. anonymous 우회도 이 캡이 덮는다.
// GLOBAL_DAILY_CAP env(문자열)로 조정, 미설정이면 기본값.
export const DEFAULT_GLOBAL_DAILY_CAP = 300;

export class UpstashGlobalDailyCap {
  private readonly url: string;
  private readonly token: string;

  constructor(opts: { url: string; token: string }) {
    this.url = opts.url.replace(/\/$/, "");
    this.token = opts.token;
  }

  // 오늘(UTC) 전역 호출 수를 1 올리고 올린 값을 반환한다. 첫 호출 때 24시간 TTL을 건다.
  async incrAndGet(): Promise<number> {
    const day = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
    const key = `global:day:${day}`;
    const incrRes = await fetch(`${this.url}/incr/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
    });
    if (!incrRes.ok) throw new Error(`Upstash INCR(global) 실패: ${incrRes.status}`);
    const body = (await incrRes.json()) as { result: number };
    const count = body.result;
    if (count === 1) {
      await fetch(`${this.url}/expire/${encodeURIComponent(key)}/${DAY_TTL_SEC}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      }).catch(() => {});
    }
    return count;
  }
}

export class UpstashUsageCounter {
  private readonly url: string;
  private readonly token: string;

  constructor(opts: { url: string; token: string }) {
    this.url = opts.url.replace(/\/$/, "");
    this.token = opts.token;
  }

  // userId 주간 카운트를 1 올리고 올린 뒤 값을 반환한다.
  // 새 키일 때(count=1) EXPIRE를 설정해 주간 TTL을 붙인다.
  async incrAndGet(userId: string): Promise<number> {
    const key = `sub:${userId}:week`;

    // INCR 호출
    const incrRes = await fetch(`${this.url}/incr/${encodeURIComponent(key)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
    });
    if (!incrRes.ok) {
      throw new Error(`Upstash INCR 실패: ${incrRes.status}`);
    }
    const incrBody = (await incrRes.json()) as { result: number };
    const count = incrBody.result;

    // 처음 카운트일 때 주간 TTL을 설정한다.
    // 이미 TTL이 붙은 키에 EXPIRE를 다시 거는 건 TTL 초기화이므로 1회만 호출한다.
    if (count === 1) {
      const expireRes = await fetch(
        `${this.url}/expire/${encodeURIComponent(key)}/${WEEK_TTL_SEC}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.token}`,
            "Content-Type": "application/json",
          },
        }
      );
      // EXPIRE 실패는 사용량 카운트 자체를 막지 않는다. 로그만 남긴다.
      if (!expireRes.ok) {
        console.warn(`Upstash EXPIRE 실패 (userId=${userId}): ${expireRes.status}`);
      }
    }

    return count;
  }
}
