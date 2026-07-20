// 외부 자원 포트(파이프라인 계열). core는 이 포트에만 의존하고 런타임 전역을 직접 쓰지 않는다.
// 런타임과 공급자 특수성(Lambda·Data API·Tavily 한국어 금지 등)은 adapters에서만 구현한다.
// 인증·결제 저장소 포트(UserRepository·PaymentGatewayPort 등)는 구현체와 함께 C2·C5에서 이식한다.

import type { ModelId, RagDoc, StreamEvent, Locale } from "../types/index.js";

export type Msg = { role: "system" | "user" | "assistant"; content: string };

export interface LlmRequest {
  model: ModelId;
  messages: Msg[];
  // 출력 토큰 상한. 비용 통제용. 미설정이면 모델 기본(무제한에 가까움).
  maxTokens?: number;
}

export interface LlmClient {
  // 구조화 JSON 1회 응답. 프롬프트 1 2 4 5에 쓴다.
  // 구현은 json_object와 thinking 비활성을 켠다.
  complete<T>(req: LlmRequest): Promise<T>;
  // term 단위 스트리밍. 프롬프트 3에 쓴다.
  // 구현(어댑터)이 업스트림 SSE 바이트를 StreamEvent로 변환해 내보낸다.
  // 업스트림 오류는 type error 이벤트로 전달하고 스트림을 종료한다.
  // signal 전달 시 취소가 업스트림 fetch까지 전파된다(취소 체인).
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
  // ttlSec는 필수. 0이거나 누락이면 구현체가 throw 한다(TTL 없는 키를 남기지 않도록).
  set(key: string, val: string, ttlSec: number): Promise<void>;
}

export interface EnvConfig {
  deepseekKey: string;
  tavilyKey: string;
  naverKeys?: string; // ko 공급자. MVP에서는 미구현(보류).
  upstashUrl: string;
  upstashToken: string;
}
