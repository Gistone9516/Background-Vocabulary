# @vock/http-app

Hono 앱 **조립** 어댑터 — 라우트를 core 파이프라인에 배선한다. 서버 기동(부트)은 없다. 계층별 부트(`adapters/local`·`adapters/aws`)가 이 앱을 감싸 실행한다.

## 구조
```
src/
├ index.ts                    공개 배럴(createApp)
├ app.ts                      createApp(deps: PipelineDeps) — 파이프라인 생성 + 라우트 등록 + /health·/config
├ routes/pipeline-routes.ts   /classify·/next·/preview·/relate·/recommend(SSE)·/detail·/summarize
└ sse-response.ts             StreamEvent → text/event-stream Response(취소 전파)
```

## 계약
- 라우트는 주입된 `Pipeline` 계약에만 의존한다(core 구현과 결합하지 않음 — 파이프라인 생성만 app.ts에서 core 팩토리로 수행).
- `tier`·`outputLocale`는 C1에서 요청 바디로 받는다. 인증 기반 티어 판정·주간 한도·위험 재게이트는 C2 게이팅 미들웨어로 대체(SoT §4).
