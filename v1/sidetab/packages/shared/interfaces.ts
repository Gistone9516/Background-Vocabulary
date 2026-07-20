// 외부 자원 인터페이스. core는 이 인터페이스에만 의존하고 런타임 전역을 직접 쓰지 않는다.
// 런타임과 공급자 특수성(Workers env, Tavily 한국어 금지)은 adapters에서만 구현한다.

import type {
  ModelId,
  RagDoc,
  StreamEvent,
  Locale,
  Tier,
  SubscriptionStatus,
  Currency,
  PgProvider,
  UserRecord,
  OutputLocale,
} from "./types.js";

export type Msg = { role: "system" | "user" | "assistant"; content: string };

export interface LlmRequest {
  model: ModelId;
  messages: Msg[];
  // 출력 토큰 상한. 비용 통제용. 미설정이면 모델 기본(무제한에 가까움).
  maxTokens?: number;
}

export interface LlmClient {
  // 구조화 JSON 1회 응답. 프롬프트 1 2 4 5에 쓴다.
  // 구현은 json_object와 thinking 비활성을 켠다(G1에서 동작 확인).
  complete<T>(req: LlmRequest): Promise<T>;
  // term 단위 스트리밍. 프롬프트 3에 쓴다.
  // 구현(core/llm)이 DeepSeek SSE 바이트를 StreamEvent로 변환해 내보낸다.
  // 업스트림 오류는 type error 이벤트로 전달하고 스트림을 종료한다.
  // signal 전달 시 취소가 업스트림 fetch까지 전파된다(구현계획 §5 취소 체인).
  streamTerms(req: LlmRequest, signal?: AbortSignal): ReadableStream<StreamEvent>;
}

export interface SearchProvider {
  // locale가 ko인데 구현체가 한국어를 지원하지 않으면 throw 한다(Tavily 한국어 금지 가드).
  search(q: {
    query: string;
    locale: Locale;
    depth: "basic" | "advanced";
    maxResults: number;
    rawContent: boolean;
  }): Promise<RagDoc[]>;
}

export interface CacheStore {
  get(key: string): Promise<string | null>;
  // ttlSec는 필수. 0이거나 누락이면 구현체가 throw 한다(Upstash는 TTL 없는 키를 남긴다).
  set(key: string, val: string, ttlSec: number): Promise<void>;
}

export interface EnvConfig {
  deepseekKey: string;
  tavilyKey: string;
  naverKeys?: string; // ko 공급자. MVP에서는 미구현(보류).
  upstashUrl: string;
  upstashToken: string;
}

// 결제 인증 포트 (Phase 0). 구현은 adapters에만 둔다. 정본은 인터페이스계약 8장이다.
// core는 이 포트를 직접 쓰지 않는다(엔타이틀먼트 게이팅은 어댑터 책임). shared에 두는 것은 계약 가시성 때문이다.

// 신규 사용자 생성 입력.
export interface NewUser {
  email: string;
  google_sub: string | null;
}

// 엔타이틀먼트 변경 패치. webhook이나 Cron이 적용한다. occurred_at으로 이벤트 순서 역전을 막는다.
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

// 엔타이틀먼트 저장소 포트. 구현은 D1(adapters)이고 후일 DynamoDB 등으로 교체할 수 있다.
export interface UserRepository {
  findById(userId: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findByGoogleSub(sub: string): Promise<UserRecord | null>;
  create(rec: NewUser): Promise<UserRecord>;
  applyEntitlement(patch: EntitlementPatch): Promise<UserRecord>; // 멱등 upsert
}

// 결제대행사 추상화. Phase 0은 인터페이스만 정의하고 구현은 Phase 1 어댑터에서 한다.
export interface CheckoutRequest {
  user_id: string;
  email: string;
  currency: Currency;
  locale: OutputLocale;
}
export interface CheckoutSession {
  checkout_url: string;
  session_ref: string;
}
export interface WebhookEvent {
  event_id: string;
  type: string;
  patch: EntitlementPatch;
}
export interface PaymentGatewayPort {
  createCheckout(req: CheckoutRequest): Promise<CheckoutSession>;
  verifyWebhook(raw: string, headers: Record<string, string>): Promise<WebhookEvent>;
  cancel(subscriptionRef: string): Promise<void>;
  refund(paymentRef: string, amountMinor?: number): Promise<void>;
}
