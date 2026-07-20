// UserRepository 의 D1 구현. D1 바인딩은 이 파일에만 둔다.
// 이식성 경계로 core 와 shared 는 D1 을 참조하지 않는다(교체 시 이 파일만 바꾼다). 정본 계약은 인터페이스계약 8장이다.

import type { UserRepository, NewUser, EntitlementPatch, UserRecord } from "@sidetab/shared";
import type { Tier, SubscriptionStatus, Currency, PgProvider } from "@sidetab/shared";

// D1 행을 도메인 UserRecord 로 바꾼다. SQLite 는 boolean 을 0 또는 1 정수로 저장한다.
function rowToUser(r: Record<string, unknown>): UserRecord {
  return {
    user_id: String(r.user_id),
    email: String(r.email),
    google_sub: r.google_sub == null ? null : String(r.google_sub),
    tier: String(r.tier) as Tier,
    subscription_status: String(r.subscription_status) as SubscriptionStatus,
    expires_at: r.expires_at == null ? null : Number(r.expires_at),
    current_period_end: r.current_period_end == null ? null : Number(r.current_period_end),
    cancel_at_period_end: Number(r.cancel_at_period_end) === 1,
    grace_until: r.grace_until == null ? null : Number(r.grace_until),
    failed_payment_count: Number(r.failed_payment_count ?? 0),
    next_retry_at: r.next_retry_at == null ? null : Number(r.next_retry_at),
    last_failure_code: r.last_failure_code == null ? null : String(r.last_failure_code),
    current_price: r.current_price == null ? null : Number(r.current_price),
    currency: r.currency == null ? null : (String(r.currency) as Currency),
    billing_interval: (String(r.billing_interval || "monthly") as "monthly" | "yearly"),
    pg_provider: r.pg_provider == null ? null : (String(r.pg_provider) as PgProvider),
    created_at: Number(r.created_at),
  };
}

export class D1UserRepository implements UserRepository {
  constructor(private db: D1Database) {}

  async findById(userId: string): Promise<UserRecord | null> {
    const row = await this.db.prepare("SELECT * FROM users WHERE user_id = ?").bind(userId).first<Record<string, unknown>>();
    return row ? rowToUser(row) : null;
  }

  async findByEmail(email: string): Promise<UserRecord | null> {
    const row = await this.db.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<Record<string, unknown>>();
    return row ? rowToUser(row) : null;
  }

  async findByGoogleSub(sub: string): Promise<UserRecord | null> {
    const row = await this.db.prepare("SELECT * FROM users WHERE google_sub = ?").bind(sub).first<Record<string, unknown>>();
    return row ? rowToUser(row) : null;
  }

  async create(rec: NewUser): Promise<UserRecord> {
    const id = crypto.randomUUID();
    const now = Date.now();
    await this.db
      .prepare(
        "INSERT INTO users (user_id, email, google_sub, tier, subscription_status, cancel_at_period_end, failed_payment_count, billing_interval, created_at) VALUES (?, ?, ?, 'free', 'none', 0, 0, 'monthly', ?)"
      )
      .bind(id, rec.email, rec.google_sub, now)
      .run();
    const created = await this.findById(id);
    if (!created) throw new Error("user_create_failed");
    return created;
  }

  // 멱등 엔타이틀먼트 upsert. 부분 패치를 현재 행과 병합해 갱신한다.
  // Phase 0 은 인증 경로만 쓰므로 단순 병합이다. 이벤트 순서 역전 가드(occurred_at 비교)는
  // webhook 이 들어오는 Phase 1 에서 강화한다(patch.occurred_at 은 그때 비교 기준으로 쓴다).
  async applyEntitlement(patch: EntitlementPatch): Promise<UserRecord> {
    const cur = await this.findById(patch.user_id);
    if (!cur) throw new Error("user_not_found");
    const m: UserRecord = {
      ...cur,
      tier: patch.tier ?? cur.tier,
      subscription_status: patch.subscription_status ?? cur.subscription_status,
      expires_at: patch.expires_at !== undefined ? patch.expires_at : cur.expires_at,
      current_period_end: patch.current_period_end !== undefined ? patch.current_period_end : cur.current_period_end,
      cancel_at_period_end: patch.cancel_at_period_end ?? cur.cancel_at_period_end,
      grace_until: patch.grace_until !== undefined ? patch.grace_until : cur.grace_until,
      failed_payment_count: patch.failed_payment_count ?? cur.failed_payment_count,
      next_retry_at: patch.next_retry_at !== undefined ? patch.next_retry_at : cur.next_retry_at,
      last_failure_code: patch.last_failure_code !== undefined ? patch.last_failure_code : cur.last_failure_code,
      current_price: patch.current_price !== undefined ? patch.current_price : cur.current_price,
      currency: patch.currency !== undefined ? patch.currency : cur.currency,
      pg_provider: patch.pg_provider !== undefined ? patch.pg_provider : cur.pg_provider,
    };
    await this.db
      .prepare(
        "UPDATE users SET tier=?, subscription_status=?, expires_at=?, current_period_end=?, cancel_at_period_end=?, grace_until=?, failed_payment_count=?, next_retry_at=?, last_failure_code=?, current_price=?, currency=?, pg_provider=? WHERE user_id=?"
      )
      .bind(
        m.tier,
        m.subscription_status,
        m.expires_at,
        m.current_period_end,
        m.cancel_at_period_end ? 1 : 0,
        m.grace_until,
        m.failed_payment_count,
        m.next_retry_at,
        m.last_failure_code,
        m.current_price,
        m.currency,
        m.pg_provider,
        m.user_id
      )
      .run();
    const updated = await this.findById(patch.user_id);
    if (!updated) throw new Error("user_update_failed");
    return updated;
  }
}
