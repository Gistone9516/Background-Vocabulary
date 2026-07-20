// @vock/core 공개 표면. 파이프라인 팩토리와 프롬프트-무관 순수 로직만 노출한다.
// 프롬프트 빌더(prompts/)는 여기서 재노출하지 않는다 — 본문이 프론트 번들로 새면 안 된다(SoT §8).
export { createPipeline } from "./pipeline.js";
export { classifyRouting, STATIC_DOMAIN_MAP } from "./locale/index.js";
export type { RoutingResult } from "./locale/index.js";
export { runRag } from "./rag/index.js";
export type { RagResult } from "./rag/index.js";
