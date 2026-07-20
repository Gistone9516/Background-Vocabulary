# vock-app — 배경노트 v2 모노레포

배경노트(Vock note)의 웹·데스크톱 공용 애플리케이션. **포트-어댑터(헥사고날)** 구조로 순수 로직(core·shared)을 런타임(웹표준)에 고정하고, 실행 계층(mock·local·aws)은 어댑터 부트로만 갈아끼운다. 상세설계 정본 = [`../docs/인터페이스계약-v2.md`](../docs/인터페이스계약-v2.md)(SoT), 구현 규칙 = [`../docs/코드규약.md`](../docs/코드규약.md).

## 구조 맵 (현재 = C1 실체화, 나머지 = 담당 사이클)

```
packages/
├ shared/            [C1] 타입·포트·파이프라인 시그니처·유틸·SSE·픽스처. 웹표준만, sink 계층
├ core/              [C1] 파이프라인(P1~P5)·RAG·로케일·프롬프트 빌더. shared에만 의존
├ adapters/
│  ├ http-app/       [C1] Hono 앱 조립(라우트↔core 배선). 부트 없음
│  ├ local/          [C1] node-server 부트 + mock 어댑터(LLM·검색·캐시) + DI 팩토리
│  ├ aws/            [C2] Lambda 부트(streamHandle)·Data API 리포·Secrets — 예정
│  └ tauri/          [C4] 파일첨부·알림·전역단축키·오프라인·업데이터 — 예정
├ web/               [C3] Vite SPA 셸 — 예정
├ desktop/           [C4] Tauri 셸(동일 SPA + tauri 어댑터) — 예정
├ landing/           [C3] Astro 설득 콘텐츠 — 예정
└ scripts/           [C1] 경계 게이트·파일크기·프롬프트 패리티·e2e(무의존 .mjs 툴링)
```
의존 방향(강제): `shared ← core ← http-app ← {aws, local}` / `shared ← ui-shared ← {web, desktop}`. 역참조·형제 직접 참조·딥임포트 = 게이트 실패.

## 설계 핵심
- **3계층 실행(SoT §0-2)**: 같은 Hono 앱을 세 부트가 공유한다. `mock`(UI 개발) / `local`(node-server + Docker PG, C2) / `aws`(Lambda + Data API, C2). 라우트에 계층 분기 없음 — 분기는 주입된 포트 구현이 담당.
- **프롬프트 자산 경계(SoT §8)**: 프롬프트 빌더 본문은 core에만. shared에는 입출력 타입(시그니처)만. 프론트 번들 유출 금지.
- **첫 단추 = v1 무손실 이식**: shared/core 로직과 프롬프트를 v1에서 그대로 옮기되, 프롬프트는 `prompt-parity` 게이트로 "v1 대비 의미 변경 0"을 강제.

## 실행·빌드
전제: Node ≥ 20, pnpm 9(코어팩). 전역 pnpm shim이 없으면 `corepack pnpm ...`로 호출.
```
corepack pnpm install                 # 워크스페이스 설치
corepack pnpm run build               # tsc -b (프로젝트 레퍼런스 빌드 = 경계 게이트 ①)
corepack pnpm run gate                # 전체 게이트: build → guard → boundary → size → prompt-parity → e2e
```
개별 게이트: `guard`(런타임 누수) · `boundary`(순환·역참조·딥임포트) · `size`(300행 상한) · `prompt-parity`(프롬프트 무손실) · `e2e`(local mock 관통).

## 현재 상태 (C1 완료)
- C1 뼈대 완료: 모노레포 + v1 shared/core 이식 + 경계 게이트 3중 + 코드규약 검사 + local mock e2e(`/classify→/next→/recommend`) 관통. 전 게이트 PASS.
- 다음 = **C2**: adapters/local 실체화(node-postgres·Upstash·DeepSeek 실키)·adapters/aws(Lambda+Data API)·인증 4종·게이팅. 인증·결제 타입/포트는 이때 함께 이식(SoT §11 이월).
