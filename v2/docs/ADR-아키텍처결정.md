# ADR — 배경노트 v2 아키텍처 결정 기록

| 항목 | 내용 |
|---|---|
| 문서 상태 | **v1.0 승인 (2026-07-21)** — ADR-003 포함 5축 전건 사용자 확정("A. 할거면 확실하게": AWS 전면 전환, 비용 차액은 클라우드 운영 학습 투자로 수용) |
| 작성일 | 2026-07-21 |
| 방법 | 5축 웹근거 조사 + 축별 적대 검증(승인된 10 에이전트, 전 축 검증 후 "추천 유지" 판정). 조사 원문 = `v2/docs/adr-research/` 5파일(출처 URL 포함) |
| 평가 기준 | SRS v1.0 요구사항 + ★특수 기준: 클라우드 운영(Cloud OP) 교육·포트폴리오 가치(사용자 커리어 목표, 2026-07-21) |

## 결정 요약

| ADR | 결정 | 한 줄 근거 |
|---|---|---|
| 001 데스크톱 셸 | **Tauri v2** | 자동 업데이트 서명이 "강제"라 NFR-604와 정확히 일치, 공식 오프라인 캐시 플러그인, 경량 |
| 002 웹 프론트 | **Vite SPA(React 유지) + 랜딩만 Astro 분리** | 앱 본체 재작성 0, Tauri 웹뷰 재사용, 설득 콘텐츠(FR-954)는 AI 크롤러까지 닿는 정적 HTML로 |
| 003 백엔드 | **AWS 전환: Lambda(스트리밍) + Aurora Serverless(PG)+Data API + S3/CloudFront** | 포트폴리오 가치 최고 + v1 포트-어댑터 이식 경로 실증. ★비용 증가는 사용자 결정 필요 |
| 004 코드 공유 | **pnpm workspaces + TS 프로젝트 레퍼런스 + dependency-cruiser, UI는 P3 패턴** | 포트-어댑터 경계를 컴파일 타임에 강제(NFR-505), 화면·훅 공유로 3플랫폼 연속성 |
| 005 광고 | **카카오 애드핏 1차 + AdSense 병행 신청(콘텐츠 페이지로 심사 유도)** | 유틸리티 앱의 AdSense 반려 리스크를 기본 시나리오로. 수익은 보조 지표 |

---

## ADR-001. 데스크톱 셸 = Tauri v2

**결정**: 데스크톱 앱(Windows·Linux)은 Tauri v2로 만든다.

**근거** (10축 정량 비교: Tauri 42/50, Electron 35, Wails 27):
- 자동 업데이트의 **서명이 선택이 아니라 강제**(끌 수 없음) — NFR-604(서명·무결성 없는 자동 업데이트 금지)를 기본값으로 충족. Electron은 서명 검증이 선택이라 운영자 실수 여지가 구조적으로 큼.
- 공식 플러그인으로 오프라인 로컬 캐시(SQL/Store) 지원 — FR-902 직결.
- OS 네이티브 웹뷰 사용으로 경량(번들 3MB대, AppImage는 76MB), Vite로 빌드한 웹 프론트를 그대로 로드 — ADR-002·004와 정합.
- iOS/Android 확장 경로 보유(모바일 앱 가능성 대비. 검증 정정: Wails v3도 alpha로 보유하나 성숙도 격차 큼).

**기각**: Electron(무겁고 서명 선택적, 단 WebKitGTK 파편화가 없는 점은 우위), Wails(생태계·업데이터 성숙도), Neutralino(요구 기능 미충족).

**리스크·확인필요**:
- ★**Wayland 전역 단축키는 셸 무관 공통 제약**(프로토콜 미표준화, X11 한정) — FR-903이 선택 기능("제공할 수 있다")이라 요구 위반은 아니나, Linux에서 우아한 강등(degrade) 설계 필요.
- **Linux 자동 업데이트는 AppImage에만 적용** — .deb/.rpm은 패키지 매니저 의존. 배포 형식 전략: AppImage(자동 업데이트) 주 + .deb/.rpm 보조 권장.
- glibc 함정: 오래된 베이스 이미지(Ubuntu 22.04 등)에서 빌드할 것.
- Windows 코드 서명 OV 인증서 연 $200~300(별도 지출, 2026-03부터 유효기간 458일 제한). EV의 SmartScreen 특전은 폐지됨 — OV로 충분.
- tauri-plugin-stronghold는 v3에서 제거 예정(공식) — 보안 저장은 대체 플러그인 계획 포함.

## ADR-002. 웹 프론트엔드 = Vite SPA(React 유지) + 랜딩 Astro 분리

**결정**: 앱 본체는 v1 React+TypeScript 자산을 승계한 Vite SPA. 랜딩·설득 콘텐츠(FR-954)만 Astro 정적 사이트로 분리해 같은 도메인 경로에 배치.

**근거**:
- 앱 본체 재작성 비용 0 (React 18+Vite+react-i18next 전부 v1 검증 조합), Tauri 웹뷰에 그대로 로드 가능.
- ★설득 콘텐츠는 유입 채널이 생명인데, **GPTBot·ClaudeBot 등 AI 크롤러는 JS를 실행하지 않고 원본 HTML만 파싱** — CSR SPA로는 AI 검색·챗봇 인용 채널에서 완전히 불리. Astro는 JS 0 정적 HTML + 필요한 곳만 React 아일랜드라 이 채널과 SEO에 최적.
- Next.js 전면 전환 기각: v1 자산 재작성 + 데스크톱용 정적 export 재분기 필요 — 이점 없이 비용만.

**리스크**: 랜딩(Astro)과 앱(SPA)의 디자인 시스템 공유는 CSS 토큰 수준으로 설계 필요. TanStack Start는 미래 재평가 후보로만 기록.

## ADR-003. 백엔드·인프라 = AWS 전환 ★승인됨(2026-07-21, 전면 전환. 단계적 이행안 기각)

**결정**: 백엔드를 AWS로 전환한다.
- 컴퓨트: **Lambda + Function URL(RESPONSE_STREAM)** + CloudFront(커스텀 도메인·WAF) — API Gateway 과금 회피, SSE 스트리밍은 Hono `streamHandle()`로 어댑터 교체만(2026-04 전 리전 GA 확인).
- DB: **Aurora Serverless(PostgreSQL) + RDS Data API** — D1과 같은 HTTP 바인딩 모델이라 이식이 가장 쉽고, RDS Proxy(월 $87 강제) 불필요, scale-to-zero로 유휴 비용 0. DynamoDB 기각(스키마 전면 재설계 = "어댑터만 교체" 하드 제약 위반 + 온디맨드는 무료 티어 미적용).
- 인증: **자체 JWT + Google OAuth 직결 유지**(v1 구조 그대로 Lambda로 포팅). Cognito는 요구사항(내부 user_id 정본)과 충돌해 정본 채택 기각 — 학습 목적 한정의 브로커 계층 옵션만 기록.
- 정적 호스팅: S3 + CloudFront + ACM + OAC (클라우드 운영 실무 표준 구성 — 포트폴리오 서사 직결).
- 크론: EventBridge Scheduler(월 1,400만 회 무료). 레이트리밋: Upstash Redis 그대로 재사용(Lambda 호환 공식 확인 — 포팅 비용 0).

**근거**: ①클라우드 운영 포트폴리오 가치 최고(IAM·Lambda·CloudWatch·CDK/SAM·CloudFront 전부 실습, 채용시장 인지도) ②v1의 "Lambda로 어댑터만 추가해 이식 가능" 하드 제약이 실제 발동하는 경로(단, 검증 발견: v1의 `adapters/lambda`는 빈 디렉터리 — 제약이 코드로 실증된 적은 없어 이번이 첫 실증) ③기능 적합성 전부 확인(스트리밍·크론·레이트리밋).

**★비용 트레이드오프 (정직 병기, 사용자 판단 요청)**:
| | CF Workers+D1 (현행) | AWS (제안) |
|---|---|---|
| 월 비용(1만 사용자, LLM 제외) | 약 $0~5 | 약 $10~30 |
| 과금 구조 | CPU 시간만(LLM 대기 무과금 — 공식 확인) | 벽시계 시간(GB-초, LLM 대기도 과금) |
| 포트폴리오 가치 | 낮음 | 높음 |

LLM 스트리밍처럼 대기가 긴 워크로드에서 Lambda가 구조적으로 더 비싼 것은 확정 사실입니다. **월 $10~25 안팎의 차액을 클라우드 운영 학습 투자로 수용할지가 이 ADR의 승인 조건입니다.** (대안: C-1 단계적 이행 — 1단계 S3+CloudFront 정적만 AWS로 저위험 학습 → 2단계 API Lambda 이관.)

**리스크·확인필요**:
- ★**RDS Data API는 서울 리전 미지원**(도쿄·버지니아·오레곤·프랑크푸르트만) — 도쿄 리전 선택 시 한국 사용자 지연 증가(LLM 지연이 지배적이라 체감 영향은 제한적일 것으로 추정, 실측 필요).
- Aurora scale-to-zero의 cold resume 지연 실측 필요(첫 로그인·추천 체감).
- RDS 프리티어 정책이 2025-07-15 이후 신규 계정에 다르게 적용 — 계정 생성 시점 기준 확인.
- Aurora DSQL(신규, 무료 구간 더 넉넉)은 Data API 부재로 기각했으나 PoC 가치 있음(낮은 신뢰).

## ADR-004. 코드 공유·저장소 = pnpm + TS 프로젝트 레퍼런스 + 경계 3중 게이트, UI는 P3

**결정**:
- npm workspaces → **pnpm workspaces** 전환(strict hoisting으로 유령 의존성 차단, Turborepo/Nx는 현 규모(패키지 6~10개, 1인)에서 과잉이라 보류).
- **TypeScript 프로젝트 레퍼런스(composite build) 완성** — 검증 발견: v1의 `tsc -b` 스크립트는 루트 references 없이 미완성 상태였음. v2에서 제대로 배선해 포트-어댑터 경계를 컴파일 타임에 강제.
- 경계 게이트 3중화: TS 레퍼런스(컴파일) + 기존 정규식 가드(portability-guard, 유지) + **dependency-cruiser**(그래프형 위반: 순환·역참조) — SRS NFR-505의 구현.
- UI 공유 = **P3 절충 패턴**: `packages/ui-shared`에 화면·훅·SSE 클라이언트(웹표준 API + props만), `packages/web`·`packages/desktop`은 얇은 셸 진입점 + 플랫폼 어댑터(파일 첨부·알림·단축키)만. core/shared의 포트-어댑터 원칙을 UI 계층까지 연장 — 3플랫폼 연속성(FR-503)과 유지보수 하드룰 직결.

**기각**: P1 통째 공유(셸 특이사항 침투 위험), P2 플랫폼별 UI(중복 구현·중복 버그 — 연속성 요구와 정면 충돌), Nx(과잉), Yarn PnP(이점 없음).

**리스크**: pnpm과 Wrangler 호환성에 열린 이슈 존재(전환 시 확인 — 단 ADR-003 채택 시 Wrangler 자체가 퇴역), TS 7.0은 GA됐으나 7.1 전까지 도입 보류.

## ADR-005. 광고(free 티어) = 카카오 애드핏 1차 + AdSense 병행

**결정**: 1차 게재는 카카오 애드핏(승인 장벽 낮음, 한국 트래픽 적합). AdSense는 병행 신청하되 **유틸리티 앱의 "콘텐츠 부족" 반려를 기본 시나리오**로 잡고, 랜딩·가이드·블로그 등 콘텐츠형 페이지(ADR-002의 Astro 영역)를 심사 대상으로 유도. 광고 수익은 서버 비용을 상쇄 못하는 보조 지표로만 취급(BEP 핵심 변수 금지).

**필수 구현**: 다국어 서비스라 EEA·영국·스위스 유입 가능 — **IAB TCF 2.2 인증 CMP(Google Funding Choices, 무료) 의무**(누락 시 계정 정지 리스크). 도구 화면(좁히기·추천)이 아니라 콘텐츠·목록 화면 위주 배치로 "저가치 페이지" 정책 회피 + "덜어내고 차분하게" 톤 유지.

**주의**: AdSense의 "소프트웨어 애플리케이션 통합 금지" 조항 — 웹사이트(SaaS)는 저촉 소지 낮으나 **데스크톱 앱 안에는 광고를 넣지 않는다**(웹 전용).

---

## 종합 스택

```
[사용자]
  웹:      Astro 랜딩(정적, 설득 콘텐츠) + Vite React SPA(앱) ← S3+CloudFront(ACM·OAC·WAF)
  데스크톱: Tauri v2 (동일 SPA 번들 + 플랫폼 어댑터, AppImage/NSIS, 서명 강제 자동 업데이트)
[API]     CloudFront → Lambda Function URL(RESPONSE_STREAM) + Hono streamHandle
           자체 JWT + Google OAuth 직결 / Upstash(레이트리밋) / EventBridge(크론)
[데이터]   Aurora Serverless(PostgreSQL) + RDS Data API  [리전: 도쿄(Data API 제약)]
[코드]    pnpm 모노레포: shared / core / ui-shared / adapters/{aws,tauri,web} / web / desktop / landing
           경계 3중 게이트: TS references + portability-guard + dependency-cruiser
```

## 남은 확인 항목 (설계·구현 중 처리)

1. Lambda 벽시계 과금의 실측(LLM 스트리밍 1회당 GB-초) — 비용 모델 재계산의 입력.
2. Aurora cold resume 지연 실측.
3. Tauri Linux 배포(AppImage 주) 빌드 파이프라인 검증 + glibc 베이스.
4. Windows OV 인증서 구매 시점(첫 데스크톱 배포 전).
5. pnpm 전환 시 lockfile 재생성·CI 갱신.
6. AdSense·애드핏 실제 신청 결과로 ADR-005 가정 검증.
