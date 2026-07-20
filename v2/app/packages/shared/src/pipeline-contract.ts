// 파이프라인 오케스트레이션 시그니처. 구현은 core/pipeline.ts.
// adapters(http-app)는 이 타입에만 의존해 라우트를 짠다(구현 결합 아님).
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
  PreviewIn,
  PreviewOut,
  RelateIn,
  RelateOut,
  StreamEvent,
  Locale,
  DomainRisk,
  Tier,
  Limits,
  OutputLocale,
} from "./types/index.js";
import type { LlmClient, SearchProvider, CacheStore } from "./ports/index.js";

export interface PipelineDeps {
  llm: LlmClient;
  search: SearchProvider;
  cache: CacheStore;
  // 운영 한도(어휘 개수·토큰 상한 등). 미지정이면 DEFAULT_LIMITS를 쓴다.
  limits?: Limits;
}

// 추천(프롬프트3) 입력. 캐시키 조립에 domain과 topic과 locale이 필요하다.
export interface RecommendInput extends Prompt3In {
  domain: string; // 정적 맵 열거 키(core/locale가 스냅)
  topic: string; // 사용자가 하려는 것. normalizeTopic으로 캐시키에 들어감.
  locale: Locale;
  domain_risk: DomainRisk; // LLM 판정 고위험을 recommend서 재차단.
  exclude?: string[]; // 이미 보여준 term명. 다음 우선순위 배치(더보기).
}

// 모든 메서드는 outputLocale를 받아 사용자에게 보일 텍스트를 그 언어로 출력한다(RAG 검색 언어와 별개).
export interface Pipeline {
  classify(input: Prompt1In, outputLocale: OutputLocale): Promise<Prompt1Out>;
  nextBranch(input: Prompt2In, outputLocale: OutputLocale): Promise<Prompt2Out>;
  // 프롬프트3. RAG(검색→캐시→주입)를 내부에서 처리하고 term 단위로 StreamEvent를 흘린다.
  // 검색 실패는 캐시 폴백 후 근거 제한으로 진행하거나 고위험이면 거부한다.
  // tier에 따라 어휘 개수와 출력 토큰 상한이 갈린다(free는 적게, paid는 많이).
  recommendStream(input: RecommendInput, tier: Tier, outputLocale: OutputLocale, signal?: AbortSignal): ReadableStream<StreamEvent>;
  summarize(input: Prompt4In, outputLocale: OutputLocale): Promise<Prompt4Out>;
  // tier에 따라 출력 토큰 상한이 갈린다. 출처 RAG는 양 티어 동일.
  detail(input: Prompt5In, tier: Tier, outputLocale: OutputLocale): Promise<Prompt5Out>;
  // 난이도 선택 직전 깊이별 대표 어휘 프리뷰. RAG 없이 LLM 1회, 한도 미집계(좁히기와 같은 비용 등급).
  preview(input: PreviewIn, outputLocale: OutputLocale): Promise<PreviewOut>;
  // 연결 턴. 좁히기 종료 직전 프로젝트 누적 kept 어휘가 현재 좁힌 작업과 연결되는지 판정해 재인 질문을 만든다(없으면 relevant=false). RAG 없이 LLM 1회, 한도 미집계.
  relate(input: RelateIn, outputLocale: OutputLocale): Promise<RelateOut>;
}

// 팩토리 시그니처. core/pipeline.ts가 구현한다.
export type CreatePipeline = (deps: PipelineDeps) => Pipeline;
