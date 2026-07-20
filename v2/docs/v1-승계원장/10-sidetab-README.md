---
원본: c:/Users/USER/Desktop/2026-하계/배경지식 사이드탭/v1/sidetab/README.md (전체)
정본: 원본 파일이 정본이며 이 원장은 v2 입력용 인벤토리다
---

### 10-1. 한 줄 정체
- 유형: 확정결정
- 출처: README.md 1~3행
- 폼팩터: 크롬확장-종속(v2에서 재설계 필요)
- 원문:
> # sidetab — 배경 어휘 사이드탭 (코드)
>
> AI에 말 걸기 전, 그 분야 핵심 어휘(말그릇)를 클릭으로 쥐여주는 크롬 확장(MV3)과 그 백엔드(스트리밍 LLM 프록시). 기획·설계 정본은 상위 폴더 `docs/`의 `배경어휘-사이드탭-기획-구체화.md`(v1.5)와 `배경어휘-사이드탭-구현계획.md`(v1.2).

### 10-2. 모노레포 패키지 구조 (npm workspaces)
- 유형: 확정결정
- 출처: README.md 5~22행 ("## 구조 (npm workspaces 모노레포)")
- 폼팩터: 크롬확장-종속(v2에서 재설계 필요)
- 원문:
> ```
> packages/
>   shared/      타입·인터페이스·프롬프트 계약 SoT (읽기 전용, opus가 관리)
>                types.ts interfaces.ts utils.ts pipeline.stub.ts prompts/ fixtures.ts
>   core/        런타임 무관 비즈니스 로직 (런타임 바인딩 직접호출 금지)
>     llm/       DeepSeekLlmClient (complete + streamTerms, Uint8Array를 StreamEvent로 변환)
>     rag/       runRag (검색 → 캐시 → 주입, TTL 규칙, 검색실패 폴백)
>     locale/    classifyRouting + STATIC_DOMAIN_MAP (로케일·고위험·hard_domain)
>     pipeline.ts createPipeline (classify·nextBranch·recommendStream·summarize·detail)
>   adapters/
>     workers/   Hono 앱 (합성 루트, env 매핑, StreamEvent를 SSE로 직렬화, 사용량 카운터)
>     search-providers/ TavilySearchProvider(영어 전용) + UpstashCacheStore(REST)
>     lambda/    (보류 — 이식 트리거 발생 시)
>   extension/   Chrome MV3 사이드패널 (React, getReader SSE 파싱, 에러 UI)
>   scripts/     검증 하니스 (probe, g1-smoke, g4g7, e2e)
> ```

### 10-3. 설계 원칙 (core/shared/adapters 계층 분리 이유)
- 유형: 확정결정
- 출처: README.md 24행
- 폼팩터: 무관(v2 그대로 유효)
- 원문:
> 설계 원칙: core는 shared 인터페이스에만 의존하고 런타임 전역을 import하지 않는다. 런타임·공급자 특수성은 adapters에만 둔다. 이로써 Cloudflare Workers 지금 / AWS Lambda 나중이 어댑터 추가로 가능하다.

### 10-4. 실행/빌드/검증 명령
- 유형: 비기능요구
- 출처: README.md 26~36행 ("## 실행 / 빌드 / 검증")
- 폼팩터: 크롬확장-종속(v2에서 재설계 필요)
- 원문:
> ```
> npm install                                              # 워크스페이스 링크 + 의존성
> npx tsc --noEmit -p tsconfig.check.json                  # 백엔드 전체 타입체크
> npm -w @sidetab/extension run build                      # 확장 빌드(dist/)
> node --env-file=.env --import tsx packages/scripts/e2e.ts # 통합 런타임 e2e
> node --env-file=.env --import tsx packages/scripts/g4g7.ts # 로케일/프롬프트 게이트
> ```
>
> 워커 로컬 실행은 `packages/adapters/workers`에서 `wrangler dev`(키는 `wrangler secret put` 또는 `.dev.vars`).

### 10-5. 필요한 환경변수 키
- 유형: 제약
- 출처: README.md 38~39행 ("### 필요한 키 (.env, 커밋 금지 — .gitignore 처리됨)")
- 폼팩터: 재검토(폼팩터 전환으로 의미 변할 수 있음)
- 원문:
> `DEEPSEEK_API_KEY`, `TAVILY_API_KEY`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`.

### 10-6. 현재 상태 스냅샷 (2026-06-24 시점)
- 유형: 교훈·경위
- 출처: README.md 41~43행 ("## 현재 상태 (2026-06-24)")
- 폼팩터: 크롬확장-종속(v2에서 재설계 필요)
- 원문:
> buildflow 1단계 완료·검증. 백엔드 통합 타입체크 PASS, 확장 빌드 PASS, 런타임 e2e PASS(classify + RAG 한국어 term 스트리밍 + 고위험 거부). 게이트 G1·G4(100%)·G7 통과.

### 10-7. 남은 결정·후속 작업 참조
- 유형: 보류·미해결
- 출처: README.md 45행
- 폼팩터: 재검토(폼팩터 전환으로 의미 변할 수 있음)
- 원문:
> 남은 결정·후속 작업은 상위 폴더 `docs/배경어휘-사이드탭-사용자판단대기.md` 참조(취소 신호 계약, domain_risk 전달, 아이콘, 첫 term 지연 UX, 익명 게이팅 등). 진입 흐름 UI(프롬프트1·2 화면)는 후속 사이클.
