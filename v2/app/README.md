# vock-app — 배경노트 v2 모노레포

배경노트(Vock note)의 웹·데스크톱 공용 애플리케이션. **포트-어댑터(헥사고날)** 구조로 순수 로직(core·shared)을 런타임(웹표준)에 고정하고, 실행 계층(mock·local·aws)은 어댑터 부트로만 갈아끼운다. 상세설계 정본 = [`../docs/인터페이스계약-v2.md`](../docs/인터페이스계약-v2.md)(SoT), 구현 규칙 = [`../docs/코드규약.md`](../docs/코드규약.md).

## 구조 맵 (현재 = C1 실체화, 나머지 = 담당 사이클)

```
packages/
├ shared/            [C1] 타입·포트·파이프라인 시그니처·유틸·SSE·픽스처. 웹표준만, sink 계층
├ core/              [C1·C2.2] 파이프라인(P1~P5)·RAG·로케일·프롬프트 빌더 + auth(JWT·엔타이틀먼트·서비스). shared에만 의존
├ adapters/
│  ├ http-app/       [C1·C2.1·C2.2] Hono 앱 조립(파이프라인+CRUD+auth 라우트↔core/리포 배선). 부트 없음
│  ├ persistence/    [C2.1·C2.2] PG 스키마·마이그레이션·리포(세션·자산·지식·프로젝트·User·JtiBlacklist). SqlRunner로 드라이버 무관
│  ├ providers/      [C2.2·C2.4] 외부 공급자 어댑터(웹표준 fetch, local·aws 공유) — Google OAuth·DeepSeek(SSE)·Tavily·Upstash
│  ├ local/          [C1·C2.1·C2.2] node-server 부트 + mock LLM/Google + PgSqlRunner(실 PG) + DI 팩토리
│  ├ aws/            [C2.5] Lambda 부트(streamHandle)·DataApiSqlRunner·Secrets — 코드 완료(배포=핸즈온, DEPLOY.md)
│  └ tauri/          [C4 S2~] 플랫폼 어댑터. S2 = 키링 토큰·루프백 OAuth, S3 = 오프라인 캐시. 퀵 캡처(S4)는 src-tauri(Rust)에 있다 — 최소화된 웹뷰는 스로틀링돼 이벤트가 유실된다(실측)
├ ui-shared/         [C3] 웹·데스크톱 공유 화면 + **여정 배선(VockApp, C4 S1 승격)**. 셸은 ShellDeps만 구현
│                    밖으로 내는 CSS 진입점 둘: `styles.css`(앱 전체) / `vars.css`(변수만, 랜딩용)
├ web/               [C3] Vite SPA 셸(5180). 남은 파일 = main·deps·auth-storage — 그것이 셸의 전부다
├ desktop/           [C4 S4] Tauri 셸(5185) — 같은 VockApp. 토큰=OS 키링, 로그인=시스템 브라우저+루프백, 오프라인 열람=캐시, 폰트=번들, 퀵 캡처=Ctrl+Shift+K(Rust). src-tauri 커맨드는 secret_* 3개(전부 배관 — 판정 금지, D-8)
├ landing/           [C3 S6] Astro 정적 랜딩(JS 0). 앱 코드 의존 없음, 디자인 토큰 변수만
└ scripts/           [C1] 경계 게이트·파일크기·프롬프트 패리티·e2e(무의존 .mjs 툴링)
```
의존 방향(강제): `shared ← {core, persistence} ← http-app ← {aws, local}` / `shared ← ui-shared ← {web, desktop}` / `landing ← (없음)` — 랜딩은 독립이고 `ui-shared`의 **변수 전용 진입점**(`@vock/ui-shared/vars.css`)만 자산으로 가져온다(SoT §7). 앱 스타일 진입점(`styles.css`)은 요소 스타일까지 담고 있어 랜딩이 가져오면 레이아웃이 조용히 앱 것으로 바뀐다 — `boundary-check.mjs`가 진입점 경로 단위로 막는다. 역참조·형제 직접 참조·딥임포트 = 게이트 실패.

## 설계 핵심
- **3계층 실행(SoT §0-2)**: 같은 Hono 앱을 세 부트가 공유한다. `mock`(UI 개발) / `local`(node-server + Docker PG, C2) / `aws`(Lambda + Data API, C2). 라우트에 계층 분기 없음 — 분기는 주입된 포트 구현이 담당.
- **프롬프트 자산 경계(SoT §8)**: 프롬프트 빌더 본문은 core에만. shared에는 입출력 타입(시그니처)만. 프론트 번들 유출 금지.
- **첫 단추 = v1 무손실 이식**: shared/core 로직과 프롬프트를 v1에서 그대로 옮기되, 프롬프트는 `prompt-parity` 게이트로 "v1 대비 의미 변경 0"을 강제.

## 실행·빌드
전제: Node ≥ 22, pnpm 9(코어팩). 전역 pnpm shim이 없으면 `corepack pnpm ...`로 호출. Lambda 런타임(nodejs22.x)과 같은 메이저를 쓴다.
```
corepack pnpm install                 # 워크스페이스 설치
corepack pnpm run build               # tsc -b (프로젝트 레퍼런스 빌드 = 경계 게이트 ①)
corepack pnpm run gate                # 목 게이트: build → guard → boundary → size → prompt-parity → e2e(mock)
docker compose up -d --wait           # 로컬 Postgres(5433)
corepack pnpm run gate-db             # PG 게이트: build → e2e-pg(영속 CRUD 왕복)
```
개별 게이트: `guard`(런타임 누수) · `boundary`(순환·역참조·딥임포트) · `size`(300행 상한) · `prompt-parity`(프롬프트 무손실) · `check-i18n`(로케일 표) · `check-landing`(랜딩 JS 0·금지 문구) · `e2e`(local mock 관통) · `e2e-pg`(Docker PG CRUD).

## 현재 상태 (C2 코드 전량 완료)
- **C1 뼈대** / **C2.1 영속**(PG e2e 18/18) / **C2.2 인증**(11/11) / **C2.3 게이팅**(9/9) / **C2.4 실 공급자**(SSE 파서 결정 검증).
- **C2.5 aws**: `@vock/aws` — DataApiSqlRunner(리포 재사용, $n→:pn·Field 매핑·트랜잭션)·Secrets 로더·streamHandle 핸들러·buildAwsDeps. migrate 문장 분리(Data API 공용). **배포 게이트 코드**(타입체크로 @aws-sdk API-정확성 확인, 실배포·스모크는 핸즈온 → `DEPLOY.md`).
- **C2 실키 스모크 완료**: DeepSeek(complete·실 SSE 스트리밍)·Tavily·Upstash 실호출 7/7(`pnpm e2e-real`, 수동).
- **C3 완료(S1~S6)**: `ui-shared`(디자인 정본 + 여정 전 화면 + 순수 상태 기계) · `web`(Vite SPA, 5180) · `landing`(Astro). 진입부터 담은 어휘까지 실서버와 관통하고, 로그인·세션 저장·재개·프로젝트·연결 턴·4개 언어가 붙어 있다. 화면 확인 = `corepack pnpm --dir packages/web run dev`.
- **C4 S4까지 완료**: 파일 첨부(FR-901 — 두 플랫폼 공통, env 티어 게이트 + 서버 절단), 퀵 캡처(FR-903 — Rust 핸들러, Ctrl+Shift+K 실측 2/2), 복습 알림(FR-904)은 알릴 대상 부재로 근거 이월(`C4-S4` §0). 남은 것 = S5(패키징·서명 — 인증서 결정 대기)·콘솔 등록 핸즈온.
- **언어**: 헤더의 선택이 저장되고 UI 문구와 생성 출력에 같은 값이 쓰인다. 문구 표는 `strings.ts`(ko, 손으로 관리)와 `strings.{en,ja,zh}.ts`(`port-i18n.mjs`가 v1 원문에서 생성)로 나뉘며, `Record<StringKey, string>` 타이핑이 키 누락을 빌드에서 막는다. 컴포넌트는 `useTr()`, React 밖은 `trIn(locale, key)`를 쓴다 — ko 전용 함수는 없다. `HttpApiConfig.getOutputLocale`도 **필수**다: 선택 사항이던 동안 셸이 빠뜨려 전 사용자가 한국어로 고정된 적이 있다.
- **C4 S5 완료(무서명 범위)**: NSIS 설치 파일(per-user, 관리자 불요) + 설치 스모크 + 웹뷰 Origin 실측(`http://tauri.localhost` — DEPLOY.md). 서명+업데이터는 인증서 결정 뒤 별도 슬라이스(선행 조건 = DEPLOY.md).
- 남은 것 = 실 AWS 배포(핸즈온 `DEPLOY.md`), C5 결제·수익 재설계, 서명·업데이터(인증서 대기), Linux 패키징(빌드 호스트 대기).
- **C4 S2에서 서버가 함께 바뀌었다(스펙 D-2 해소)**: CORS는 `corsOrigins` 주입 시에만 붙고(미설정=현행 무변화), `clientCheck`는 웹 Origin/데스크톱 `x-vock-client` 표식을 비용 경로에서 검사한다(**남용 억제 수단** — NFR-308, 로컬 skip). `users.locale`은 로그인 응답에 실리고 `PATCH /me/locale`로 갱신된다(FR-952, 정본=서버). 세 경계는 `e2e-clientcheck`가 양성·음성으로 검사한다.
