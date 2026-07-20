// 유효 권한 계산(순수). grace 기간에는 pro를 유지한다. v1 §8 이식.

import type { UserRecord, Entitlement } from "@vock/shared";

export function effectiveEntitlement(u: UserRecord): Entitlement {
  const now = Date.now();
  const isPro = u.tier === "paid" || (u.grace_until != null && u.grace_until > now);
  return {
    user_id: u.user_id,
    effective_tier: isPro ? "paid" : "free",
    subscription_status: u.subscription_status,
    expires_at: u.expires_at,
  };
}
