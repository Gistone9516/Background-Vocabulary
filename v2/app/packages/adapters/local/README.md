# @vock/local

로컬 실행 계층 어댑터 — `@hono/node-server` 부트 + 포트 구현 조립. 같은 http-app을 로컬 Node에서 띄운다.

## 구조
```
src/
├ index.ts          공개 배럴(bootLocal·buildMockDeps·mock 어댑터들)
├ boot.ts           bootLocal(opts) — node-server로 http-app 기동(임의 포트 지원)
├ deps.ts           buildMockDeps() — mock 포트 조립 팩토리(계층 분기의 유일 지점)
└ mocks/
   ├ mock-llm.ts    MockLlmClient — 프롬프트별 픽스처 응답 + term 스트림(취소 존중)
   ├ mock-search.ts MockSearchProvider — 빈 결과(RAG limited 경로 관통)
   ├ mem-cache.ts   InMemoryCacheStore — TTL 흉내(만료 시각)
   └ index.ts       mock 배럴
```

## C1 범위와 이월
- C1은 **mock 계층**만 구현한다(부트가 실제로 뜨고 파이프라인을 관통함을 증명).
- 실 local 계층 = node-postgres 리포(Docker PG)·Upstash·DeepSeek 실키는 **C2**에서 `buildLocalDeps`로 추가한다(SoT §0-2·§9 C2).
