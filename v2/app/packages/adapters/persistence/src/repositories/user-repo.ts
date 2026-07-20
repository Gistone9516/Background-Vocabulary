// UserRepository의 PG 구현(v1 D1UserRepository 이식). SqlRunner에만 의존.

import type { SqlRunner, UserRepository, NewUser, EntitlementPatch, UserRecord, Tier, SubscriptionStatus, Currency, PgProvider } from "@vock/shared";
import { asNum, asNumOrNull } from "../json.js";

type Row = Record<string, unknown>;

function toUser(r: Row): UserRecord {
  return {
    user_id: String(r.user_id),
    email: String(r.email),
    google_sub: r.google_sub == null ? null : String(r.google_sub),
    tier: String(r.tier) as Tier,
    subscription_status: String(r.subscription_status) as SubscriptionStatus,
    expires_at: asNumOrNull(r.expires_at),
    current_period_end: asNumOrNull(r.current_period_end),
    cancel_at_period_end: r.cancel_at_period_end === true,
    grace_until: asNumOrNull(r.grace_until),
    failed_payment_count: asNum(r.failed_payment_count ?? 0),
    next_retry_at: asNumOrNull(r.next_retry_at),
    last_failure_code: r.last_failure_code == null ? null : String(r.last_failure_code),
    current_price: asNumOrNull(r.current_price),
    currency: r.currency == null ? null : (String(r.currency) as Currency),
    billing_interval: String(r.billing_interval || "monthly") as "monthly" | "yearly",
    pg_provider: r.pg_provider == null ? null : (String(r.pg_provider) as PgProvider),
    created_at: asNum(r.created_at),
  };
}

export class PgUserRepository implements UserRepository {
  constructor(private readonly sql: SqlRunner) {}

  private async one(where: string, param: string): Promise<UserRecord | null> {
    const rows = await this.sql.query<Row>(`SELECT * FROM users WHERE ${where} = $1`, [param]);
    return rows[0] ? toUser(rows[0]) : null;
  }

  findById(userId: string): Promise<UserRecord | null> {
    return this.one("user_id", userId);
  }
  findByEmail(email: string): Promise<UserRecord | null> {
    return this.one("email", email);
  }
  findByGoogleSub(sub: string): Promise<UserRecord | null> {
    return this.one("google_sub", sub);
  }

  async create(rec: NewUser): Promise<UserRecord> {
    const id = crypto.randomUUID();
    const now = Date.now();
    await this.sql.execute(
      "INSERT INTO users (user_id, email, google_sub, tier, subscription_status, cancel_at_period_end, failed_payment_count, billing_interval, created_at) VALUES ($1,$2,$3,'free','none',FALSE,0,'monthly',$4)",
      [id, rec.email, rec.google_sub, now],
    );
    const created = await this.findById(id);
    if (!created) throw new Error("user_create_failed");
    return created;
  }

  // 멱등 엔타이틀먼트 upsert. 부분 패치를 현재 행과 병합해 갱신한다.
  // 이벤트 순서 역전 가드(occurred_at 비교)는 webhook이 들어오는 C5에서 강화한다.
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
    await this.sql.execute(
      "UPDATE users SET tier=$1, subscription_status=$2, expires_at=$3, current_period_end=$4, cancel_at_period_end=$5, grace_until=$6, failed_payment_count=$7, next_retry_at=$8, last_failure_code=$9, current_price=$10, currency=$11, pg_provider=$12 WHERE user_id=$13",
      [m.tier, m.subscription_status, m.expires_at, m.current_period_end, m.cancel_at_period_end, m.grace_until, m.failed_payment_count, m.next_retry_at, m.last_failure_code, m.current_price, m.currency, m.pg_provider, m.user_id],
    );
    const updated = await this.findById(patch.user_id);
    if (!updated) throw new Error("user_update_failed");
    return updated;
  }
}
