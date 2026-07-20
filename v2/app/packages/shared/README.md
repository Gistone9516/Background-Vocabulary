# @vock/shared

계약의 최하위 계층 — 타입·포트·파이프라인 시그니처만. **웹표준 API만** 사용하며 런타임 전역(Node·Lambda·DOM 밖)은 두지 않는다. 다른 워크스페이스 패키지에 의존하지 않는다(sink 계층).

## 구조
```
src/
├ index.ts              공개 배럴(소비자는 여기서만 가져온다)
├ types/
│  ├ enums.ts           JobType·GapType·Tag·Tier·Locale·OutputLocale·DomainRisk·ModelId
│  ├ limits.ts          Limits·DEFAULT_LIMITS·ClientLimits
│  ├ pipeline-io.ts     Choice·Term·Source·StreamEvent·Prompt1~5 In/Out·Preview·Relate
│  └ index.ts           타입 배럴
├ ports/
│  ├ pipeline-ports.ts  LlmClient·SearchProvider·CacheStore·EnvConfig(+Msg·LlmRequest)
│  └ index.ts           포트 배럴
├ pipeline-contract.ts  Pipeline·PipelineDeps·RecommendInput·CreatePipeline
├ utils.ts              normalizeTopic·ragCacheKey(순수 함수)
├ sse.ts                toSseLine·toSseWire(wire 직렬화)
└ fixtures.ts           SAMPLE_TERMS·SSE_HAPPY·SSE_ERROR(테스트 픽스처)
```

## 경계
- 프롬프트 빌더 **본문은 여기 없다**(core에만). shared는 입출력 타입=시그니처만 보유(SoT §8).
- 인증·결제 저장소 포트(UserRepository·PaymentGatewayPort·JWT 클레임 등)는 구현체와 함께 C2·C5에서 이식(현재 미포함 = 죽은 코드 회피, SoT §11 이월).
