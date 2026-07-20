# @vock/core

파이프라인·RAG·로케일 라우팅·프롬프트 빌더 등 **순수 로직**. `@vock/shared`의 포트에만 의존하고 런타임 전역(fetch 구현·DB·프레임워크)은 두지 않는다 — 그건 어댑터의 몫이다.

## 구조
```
src/
├ index.ts            공개 배럴(createPipeline·classifyRouting·runRag·STATIC_DOMAIN_MAP)
├ pipeline.ts         createPipeline — P1~P5 오케스트레이션(주입된 포트만 호출)
├ locale/index.ts     classifyRouting·STATIC_DOMAIN_MAP(정적 도메인 라우팅·고위험 게이트)
├ rag/index.ts        runRag(검색→캐시→grounding, 실패 시 limited 폴백)
└ prompts/            프롬프트 빌더 본문(SoT §8 — 프론트 번들 유출 금지, 배럴 재노출 안 함)
   ├ blocks.ts        공통 지시 블록(EYE_LEVEL·SECURITY_GUARD·CHOICE_RULES·langInstruction 등)
   ├ classify.ts      buildPrompt1
   ├ narrow.ts        buildPrompt2
   ├ recommend.ts     buildPrompt3
   ├ preview.ts       buildPreview
   ├ relate.ts        buildRelate
   ├ summarize.ts     buildPrompt4
   ├ detail.ts        buildPrompt5
   └ index.ts         빌더 배럴(core 내부용 — pipeline만 소비)
```

## 경계·게이트
- 프롬프트 빌더는 core에만 존재하며 `index.ts`로 재노출하지 않는다(프론트 유출 방지).
- 프롬프트 텍스트는 v1 대비 **의미 변경 0**을 프롬프트 패리티 게이트(`scripts/prompt-parity.mjs`)가 골든 베이스라인 대조로 강제한다.
- 실제 LLM 클라이언트(DeepSeek wire·SSE 증분 파서)는 공급자 특수성이라 core가 아니라 어댑터에 있다(C2).
