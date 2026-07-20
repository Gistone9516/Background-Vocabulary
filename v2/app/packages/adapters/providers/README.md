# @vock/providers

외부 공급자 어댑터 — 웹표준 `fetch`만 쓰는 런타임 무관 구현이라 local·aws 부트가 공유한다. `@vock/shared` 포트에만 의존.

## 구조
```
src/
├ index.ts          공개 배럴
└ google-oauth.ts   RealGoogleOAuthClient(Google 토큰 교환, platform별 client_id/secret)
```

## 예정(C2.4)
DeepSeek LLM 클라이언트(SSE 증분 파서) · Tavily 검색(ko 한국어 금지 가드) · Upstash 캐시(REST). 전부 같은 포트 계약(LlmClient·SearchProvider·CacheStore)으로 구현.
