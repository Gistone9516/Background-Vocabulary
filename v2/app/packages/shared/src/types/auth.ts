// 인증·엔타이틀먼트 타입(v1 §8 이월). 시각 단위 경계: JWT=초, DB·도메인=밀리초.

import type { Tier } from "./enums.js";

// 구독 상태. tier와 한 트랜잭션으로 같이 갱신해 불일치를 막는다.
export const SUBSCRIPTION_STATUSES = ["none", "active", "canceling", "past_due", "grace", "expired", "suspended", "refunded"] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

// 결제대행사 식별자. 리터럴 union을 쓰지 않는다(어댑터 추가 시 이 파일 불변). 허용목록 검증은 어댑터에서만.
export type PgProvider = string;

// 결제 통화.
export type Currency = "KRW" | "USD";

// 사용자 레코드. users 행의 도메인 표현. PK=내부 user_id, 소유 식별자=email.
// google_sub는 소셜 연결 보조 컬럼(단독 PK 금지 — 계정 삭제 시 고아 구독 회피). 시각=epoch 밀리초.
export interface UserRecord {
  user_id: string;
  email: string;
  google_sub: string | null;
  tier: Tier;
  subscription_status: SubscriptionStatus;
  expires_at: number | null;
  current_period_end: number | null;
  cancel_at_period_end: boolean;
  grace_until: number | null;
  failed_payment_count: number;
  next_retry_at: number | null;
  last_failure_code: string | null;
  current_price: number | null;
  currency: Currency | null;
  billing_interval: "monthly" | "yearly";
  pg_provider: PgProvider | null;
  created_at: number;
}

// 엔타이틀먼트. 서버가 판정한 유효 권한. grace 기간에는 pro를 유지한다.
export interface Entitlement {
  user_id: string;
  effective_tier: Tier;
  subscription_status: SubscriptionStatus;
  expires_at: number | null;
}

// 액세스 토큰 클레임. HS256 서명. 시각=epoch 초. 발급 15분.
export interface AccessTokenClaims {
  sub: string; // 내부 user_id
  tier: Tier; // 서버가 판정한 effective_tier
  email: string;
  iat: number;
  exp: number; // 발급 시각 + 15분
  jti: string;
}

// 리프레시 토큰 클레임. 30일. 갱신 엔드포인트에서만 검증. 시각=epoch 초.
export interface RefreshTokenClaims {
  sub: string;
  typ: "refresh"; // 액세스 토큰과 구분(액세스에는 typ 없음)
  iat: number;
  exp: number; // 발급 시각 + 30일
  jti: string; // 블랙리스트 키. 갱신 시점에만 검사.
}

// 신규 사용자 생성 입력.
export interface NewUser {
  email: string;
  google_sub: string | null;
}

// 엔타이틀먼트 변경 패치. webhook·Cron이 적용. occurred_at으로 이벤트 순서 역전을 막는다.
export interface EntitlementPatch {
  user_id: string;
  occurred_at: number;
  tier?: Tier;
  subscription_status?: SubscriptionStatus;
  expires_at?: number | null;
  current_period_end?: number | null;
  cancel_at_period_end?: boolean;
  grace_until?: number | null;
  failed_payment_count?: number;
  next_retry_at?: number | null;
  last_failure_code?: string | null;
  current_price?: number | null;
  currency?: Currency | null;
  pg_provider?: PgProvider | null;
}
