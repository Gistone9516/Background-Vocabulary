// 파이프라인 오케스트레이션 시그니처. 구현은 core/pipeline.ts(B 에이전트).
// C(adapters/workers)는 이 타입에만 의존해 Hono 라우트를 짠다(구현 결합 아님).
// shared는 읽기 전용이므로 여기에는 타입만 둔다.

import type {
  Prompt1In,
  Prompt1Out,
  Prompt2In,
  Prompt2Out,
  Prompt3In,
  Prompt4In,
  Prompt4Out,
  Prompt5In,
  Prompt5Out,
  StreamEvent,
  Locale,
  DomainRisk,
} from "./types.js";
import type { LlmClient, SearchProvider, CacheStore } from "./interfaces.js";

export interface PipelineDeps {
  llm: LlmClient;
  search: SearchProvider;
  cache: CacheStore;
}

// 추천(프롬프트3) 입력. 캐시키 조립에 domain과 topic과 locale이 필요하다.
export interface RecommendInput extends Prompt3In {
  domain: string; // 정적 맵 열거 키(core/locale가 스냅)
  topic: string; // 사용자가 하려는 것. normalizeTopic으로 캐시키에 들어감.
  locale: Locale;
  domain_risk: DomainRisk; // LLM 판정 고위험을 recommend서 재차단(판단대기 #2).
  exclude?: string[]; // 이미 보여준 term명. 다음 우선순위 배치(D4 더보기).
}

export interface Pipeline {
  classify(input: Prompt1In): Promise<Prompt1Out>;
  nextBranch(input: Prompt2In): Promise<Prompt2Out>;
  // 프롬프트3. RAG(검색→캐시→주입)를 내부에서 처리하고 term 단위로 StreamEvent를 흘린다.
  // 검색 실패는 캐시 폴백 후 근거 제한으로 진행하거나 고위험이면 거부한다(구현계획 6장).
  recommendStream(input: RecommendInput, signal?: AbortSignal): ReadableStream<StreamEvent>;
  summarize(input: Prompt4In): Promise<Prompt4Out>;
  detail(input: Prompt5In): Promise<Prompt5Out>;
}

// 팩토리 시그니처. core/pipeline.ts가 구현한다.
export type CreatePipeline = (deps: PipelineDeps) => Pipeline;
