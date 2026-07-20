# ADR 축2: 웹 프론트엔드 — 프레임워크·빌드 선정

담당 범위: v1 React+TypeScript 자산(useReducer 기반 SPA, theme.css) 재사용 전제하의 프레임워크·빌드 선정. React 유지 시 Vite SPA vs Next.js(랜딩 SEO vs 앱 트레이드오프), 데스크톱 셸 코드공유, 광고(AdSense) 호환, i18n, 반응형/모바일. 상태관리·스타일은 개괄만.

## 0. 전제 확인 (SRS/제품근거 대조, v2/docs 기준)

- v1 자산은 이미 포트-어댑터 모노레포(`core/adapters/extension/shared/scripts`)로 분해되어 있고, `extension` 패키지는 React 18.3.1 + Vite 6 + `@vitejs/plugin-react`다. [fact-cited: 로컬 `v1/sidetab/packages/extension/package.json` 확인]
- SRS C-16/C-17: core·shared는 런타임·전역 비참조, 웹표준 API(fetch/Web Streams/Web Crypto/AbortController)만 사용. 이 경계는 프레임워크 선택과 무관하게 유지해야 하는 상위 제약이다.
- SRS FR-954/2.2.1: 랜딩·온보딩은 "AI 시대에 배경지식이 왜 필요한가"를 **설득하는 콘텐츠**를 1급 과업으로 포함해야 한다. 이는 순수 앱(로그인 후 사용) 서비스가 아니라, 비전공자 잠재고객을 오가닉 유입으로 설득해야 하는 **콘텐츠 마케팅 성격의 공개 페이지**가 프론트엔드에 섞여 있다는 뜻이다.
- NFR-301: free 티어는 **익명·비인증 요청도 서버가 한도 강제** — 즉 앱 본체(진입~좁히기~추천~상세)도 로그인 장벽 뒤에 숨는 대시보드형이 아니라 공개 접근이 가능한 인터랙티브 플로우다. 따라서 "공개 페이지=SSR, 로그인 뒤=SPA"라는 흔한 이분법이 깔끔하게 들어맞지 않는다.
- 데스크톱(Windows/Linux, FR-901~905)은 별도 셸이 필요하며 웹 프론트엔드와 코드 공유 여부가 이번 축의 명시적 평가 기준이다.

## 1. 후보

| 후보 | 개요 |
|---|---|
| A. Vite SPA(현행 유지) + 별도 정적 랜딩 | v1 React 앱을 그대로 승계, Cloudflare Workers 정적자산으로 배포. 랜딩/설득 콘텐츠(FR-954)만 별도의 정적 생성 사이트(Astro 권장)로 분리, 같은 도메인에 경로 라우팅 |
| B. Next.js 전면 전환 | 랜딩·앱을 하나의 Next.js(App Router)로 통합, SSR/SSG+클라이언트 아일랜드 |
| C. React Router v7(Framework Mode) | Next.js와 Vite SPA의 중간, 라우트별 SSR/SPA 선택 가능한 통합 프레임워크 |
| D. Vite SPA 단일체(랜딩도 SPA로 흡수) | 분리 없이 랜딩까지 클라이언트 렌더로 처리 |

## 2. 사실관계 (근거 표기)

### 2.1 Vite SPA vs Next.js — SEO/랜딩 트레이드오프
- Next.js는 크롤러에 완성된 HTML을 먼저 제공(SSG/SSR)하여 크롤링·인덱싱 지연이 없고, 콘텐츠 중심 공개 페이지에서 LCP 1.1~1.8초대인 반면 Vite SPA는 JS 렌더 완료까지 크롤러가 대기해야 하며 초기 화이트스크린 2~3초가 흔히 보고된다. [fact-cited, https://techsy.io/en/blog/nextjs-vs-react-vite ; https://dev.to/axibord/why-nextjs-beats-react-vite-for-spas-its-not-just-about-seo-b9g] (주의: 위 출처는 SEO 대행사·블로그성 콘텐츠로 벤더 중립성이 약함, 수치는 참고치로만 사용)
- Google 공식 문서(Search Central) 기준: Googlebot은 2단계 인덱싱(1차: 원본 HTML 즉시 크롤, 2차: 헤드리스 Chromium으로 JS 렌더 후 재크롤)을 수행하며, 2차 렌더 대기는 자원 여력에 따라 수 시간~수 주까지 걸릴 수 있다. 즉 순수 CSR SPA도 결국 인덱싱은 되지만 **지연**이 발생한다. [fact-cited, https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics]
- ★중요 사실: GPTBot·ClaudeBot·PerplexityBot 등 **AI 크롤러는 JS를 실행하지 않고 원본 HTML만 파싱**한다. [fact-cited, https://almcorp.com/blog/google-removes-javascript-seo-warning/] → "AI 시대에 배경지식이 왜 필요한가"라는 설득 콘텐츠(FR-954)를 AI 검색·챗봇 답변에 인용시키고 싶다면(요즘 오가닉 유입 채널 중 하나) CSR SPA는 이 채널에서 완전히 불리하다. 이는 순수 Google SEO보다 이 제품의 랜딩 목적에 더 직결되는 근거다.
- 커뮤니티 컨센서스(2026년 다수 소스 공통 프레임): "80%가 공개 콘텐츠(마케팅·블로그)면 Next.js, 로그인 뒤 앱이면 Vite+React가 낫다"는 하이브리드 분리 권장이 반복 등장한다. [fact-cited, https://techsy.io/en/blog/nextjs-vs-react-vite ; https://www.the90scompany.com/blog/nextjs-vs-vite-react-choosing-the-right-stack] (출처 다수가 SEO 마케팅 블로그라 결론의 방향성만 참고하고, 구체 수치는 낮게 신뢰)

### 2.2 Cloudflare Workers 배포 적합성 (기존 백엔드와의 결합)
- Cloudflare는 **Hono API + React SPA + Cloudflare Vite 플러그인**을 "풀스택 앱"으로 공식 시나리오화해두었다: 정적자산(`not_found_handling = "single-page-application"`)과 Worker 코드를 **단일 배포 단위**로 묶어 하나의 Worker가 API와 SPA를 함께 서빙한다. [fact-cited, https://developers.cloudflare.com/workers/vite-plugin/tutorial/ ; https://blog.cloudflare.com/full-stack-development-on-cloudflare-workers/]
- Next.js도 Cloudflare Workers에 올릴 수 있으나 **OpenNext 어댑터**를 통해서만 가능하고, Next.js 빌드 산출물을 변환하는 별도 계층이 필요하며 Node.js 런타임 호환 계층을 요구한다. Next.js 16 최신 마이너와 14/15 일부만 지원되고 14 지원은 2026 Q1에 종료됐다. [fact-cited, https://opennext.js.org/cloudflare ; https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/] → v1/v2가 이미 채택한 "Hono on Workers" 백엔드와 대비했을 때, Next.js는 **어댑터 한 겹이 더 필요한 이질적 스택**이 된다. Vite SPA는 어댑터 없이 네이티브로 같은 Worker에 얹힌다.
- React Router v7은 Framework Mode에서 라우트 단위로 `ssr:false`(SPA 모드) 지정이 가능해 Next.js와 순수 SPA의 중간 지점을 제공하며, Cloudflare도 `cloudflare/react-router-hono-fullstack-template` 공식 템플릿을 제공한다. [fact-cited, https://reactrouter.com/start/modes ; https://github.com/cloudflare/react-router-hono-fullstack-template] — 다만 이 템플릿의 실사용 사례·성숙도는 Hono+Vite-SPA 조합만큼 검증되지 않았다(공식 문서 존재 확인만, 대규모 채택 사례는 미확인).

### 2.3 데스크톱 셸 코드 공유
- Tauri 2는 Rust 백엔드 + 웹 프런트(React/Vue/Svelte 등 임의) 조합을 지원하며, 프런트엔드는 OS 네이티브 WebView(Windows: WebView2, macOS/Linux: WebKit)에서 그대로 구동된다. "Hello World" 번들이 3MB 미만으로 Electron(150MB+) 대비 경량이다. [fact-cited, https://dev.to/ottoaria/tauri-in-2026-build-cross-platform-desktop-apps-with-web-technologies-better-than-electron-11mo]
- 실사용 사례(Tauri v2 + React 19 조합)가 2026년 다수 보고됨. [fact-cited, https://dev.to/purpledoubled/how-i-built-a-desktop-ai-app-with-tauri-v2-react-19-in-2026-1g47]
- 자동 업데이트(FR-905/NFR-604): Tauri updater는 **자체 서명 키페어(코드서명과 별개)로 업데이트 페이로드에 서명**해야 하며 비활성화 불가, Windows는 NSIS/MSI + `.sig`, Linux는 AppImage 기반 `.tar.gz`를 생성한다. [fact-cited, https://v2.tauri.app/plugin/updater/ ; https://v2.tauri.app/distribute/sign/windows/] → NFR-604(서명·무결성)를 실제로 만족시키는 구체 메커니즘이 이미 존재함을 확인.
- **핵심 결론**: v1이 이미 core/shared를 웹표준 API로 분리해뒀으므로(C-16/C-17), Vite로 빌드된 React SPA 번들은 그 자체로 Tauri의 웹뷰 콘텐츠로 재사용 가능하다. 데스크톱 고유 기능(FR-901 로컬파일, FR-902 오프라인 캐시, FR-903 전역단축키, FR-904 알림, FR-905 자동업데이트)은 기존 `adapters/` 패턴과 동일하게 **새 Tauri 어댑터 패키지**로 얹으면 되고, 이는 v1이 크롬 확장을 어댑터로 다룬 것과 동형이다. Next.js로 전환할 경우 SSR 산출물은 데스크톱 웹뷰에 그대로 들어가지 않으므로(서버가 없는 오프라인 상황 포함) **어차피 클라이언트 전용 빌드 모드(정적 export)로 다시 꺾어야 한다** — 이는 Next.js 채택이 데스크톱 공유 관점에서 이점이 아니라 부담이 된다는 뜻이다.

### 2.4 광고(AdSense) 호환성
- AdSense는 React/Angular/Vue 등 SPA 프레임워크와 공식적으로 호환되며, `index.html`에 스크립트 태그를 심고 **라우트 전환 시마다 `adsbygoogle.push({})`를 수동 호출**해 광고를 갱신해야 한다는 구현상 제약이 있다(SPA 특유의 이슈, 프레임워크 자체 결함은 아님). [fact-cited, https://jasonwatmore.com/add-google-adsense-to-a-single-page-app-react-angular-vue-next-etc ; https://support.google.com/adsense/thread/27854974/how-to-handle-adsense-ads-for-an-spa-single-page-app]
- ★리스크(제품 특유, [assumption]에 가까움): AdSense 정책은 "얇은 콘텐츠/저가치 페이지"(도구 위젯만 있고 설명이 부족한 계산기류 등)를 명시적으로 저평가한다. [fact-cited, 정책 요지 다수 소스 공통] SRS TR-09에서 광고는 **free 티어**에 표시하는데, free 티어의 핵심 화면(좁히기 다지선다, 추천 리스트, 상세 카드)은 "도구 인터페이스"에 가까워 이 저가치 판정 리스크에 걸릴 가능성이 있다. 반대로 FR-954의 설득 콘텐츠(왜 배경지식인가)나 세션/자산 목록처럼 텍스트 설명이 있는 화면은 상대적으로 안전하다. **이는 사실관계 확인이 아니라 제품 구조상 리스크 플래그이므로, 실제 배치는 결제·수익 재설계 문서(TR-09 위임)에서 AdSense 정책 문서 재확인 후 화면별 배치를 정할 것을 권고.**
- 아키텍처 결론: 광고 삽입은 SPA·Next.js 어느 쪽이든 기술적으로 가능하며 **이 축의 프레임워크 선택을 가르는 차별 요인이 아니다**(구현 난이도 차이도 크지 않음).

### 2.5 다국어(i18n)
- `react-i18next`는 프레임워크 종속 없이 Vite/CRA/Electron/Tauri 등 임의 React 환경에서 동작하는 반면 `next-intl`은 Next.js App Router 전용(서버 컴포넌트 활용이 강점)이다. 주간 다운로드는 `react-i18next` 약 280만 vs `next-intl` 약 90만(성장률은 next-intl이 가파름, App Router 채택 증가와 연동). [fact-cited, https://simplelocalize.io/blog/posts/react-i18next-vs-next-intl/ ; 종합출처 다건] SPA에는 `react-i18next`가 명시적으로 권장된다.
- v2는 ko/en/ja/zh 4개 언어(FR-952)와 한국어 조사 처리(FR-953, 이건 서버측 LLM 생성물 문제라 프론트 프레임워크와 무관)를 요구한다. Vite SPA + `react-i18next` 조합은 v1에서 이미 검증된 조합이라 **전환 비용이 0**이고, Tauri 데스크톱 셸에서도 동일 라이브러리가 그대로 동작한다(웹뷰도 결국 브라우저 컨텍스트).
- Next.js로 갈 경우 App Router용 i18n(`next-intl` 또는 `next-i18next`)으로 다시 배선해야 하며, 이는 v1 자산과 별개의 재작업이다.

### 2.6 반응형/모바일 웹 (NFR-601~602)
- 반응형 구현(브레이크포인트, 뷰포트 대응)은 Vite SPA·Next.js 어느 쪽이든 동일하게 CSS/컴포넌트 레이어의 문제이며, 프레임워크 선택이 반응형 구현 난이도를 가르지 않는다 — 즉 **이 항목은 이번 축의 의사결정에 실질적으로 비차별적**이다. v1의 `theme.css`는 320px 사이드패널 전제로 작성됐으므로(SRS 1.3 "v1의 UI 배치 규칙 중 좁은 패널 전제인 것은 요구사항이 아니라 재설계 대상") 반응형 재설계 자체는 필요하지만, 이는 프레임워크 문제가 아니라 CSS/레이아웃 설계 문제다.

### 2.7 랜딩 전용 대안: Astro
- Astro의 아일랜드 아키텍처는 기본적으로 JS를 0으로 출하하고 상호작용이 필요한 컴포넌트만 개별 하이드레이션한다. 콘텐츠 중심 마케팅 사이트에서 Lighthouse 98+, 초기 페이지 가중치 60%+ 절감 사례가 보고된다. [fact-cited, https://uguraslim.com/blog/astro-react-19-islands-shipping-zero-javascript-until-user-i/ ; https://migratelab.com/resources/why-astro-best-framework-marketing-sites-2026] Astro는 React 컴포넌트를 아일랜드로 그대로 재사용할 수 있어(공식 `@astrojs/react` 통합), FR-954 콘텐츠 안에 필요한 인터랙션(예: 상황 칩 미리보기)이 있어도 React 컴포넌트를 재사용 가능하다.

## 3. 축별 평가 (5점 척도, 상위일수록 유리)

| 평가축 | A. Vite SPA + Astro 랜딩 분리 | B. Next.js 전면 | C. React Router v7 Framework | D. Vite SPA 단일(랜딩 포함) |
|---|---|---|---|---|
| 랜딩 SEO/AI크롤러 노출 (FR-954) | 5 (Astro 정적 HTML, JS 크롤러 무관) | 4 (SSG/SSR로 우수하나 어댑터 오버헤드) | 4 (라우트별 SSR 가능하나 사례 적음) | 1 (CSR만, AI크롤러 완전 배제) |
| 앱 인터랙션 구현 비용(v1 자산 재사용) | 5 (변경 없음) | 2 (전면 재작성 필요) | 3 (일부 재배선, 라우팅 재작성) | 5 (변경 없음) |
| 백엔드(Hono on Workers) 결합도 | 5 (Vite 플러그인 네이티브, 단일 Worker 배포) | 2 (OpenNext 어댑터 필요, Node 런타임 계층) | 4 (공식 템플릿 존재하나 성숙도 낮음) | 5 (동일) |
| 데스크톱(Tauri) 셸 공유 | 5 (CSR 번들 그대로 웹뷰 콘텐츠) | 2 (별도 정적 export 모드로 재분기 필요) | 3 (SPA 모드로 export 가능하나 검증 사례 적음) | 5 (동일) |
| i18n 전환 비용 | 5 (react-i18next 유지) | 2 (App Router i18n 재배선) | 3 | 5 (동일) |
| 광고(AdSense) 호환 | 4 (비차별, 구현 동일 난이도) | 4 (비차별) | 4 (비차별) | 3 (저가치 콘텐츠 리스크가 앱과 랜딩 모두에 걸림) |
| 반응형/모바일 | 4 (비차별) | 4 (비차별) | 4 (비차별) | 4 (비차별) |
| 마이그레이션·학습 리스크 | 5 (거의 없음, 신규 Astro만 추가) | 1 (전면 재작성 + 새 어댑터 학습) | 2 (프레임워크 전환 + 사례 부족) | 5 (거의 없음) |

## 4. 추천

**A안(Vite SPA 현행 유지 + 랜딩/설득 콘텐츠만 Astro로 분리, 같은 도메인 경로 분할, 백엔드와 동일 Cloudflare Workers 배포)을 추천한다.**

근거 요약:
1. v1 React+TS SPA 자산 재사용이라는 전제와 가장 부합 — 앱 본체(진입~좁히기~추천~상세~담기)는 코드 변경 없이 승계되고, 기존 포트-어댑터 경계(C-16/C-17)도 그대로 유효하다.
2. 기존 백엔드가 이미 Hono on Cloudflare Workers이므로, Cloudflare 공식 Vite 플러그인 경로(SPA 정적자산 + Worker API를 단일 배포 단위)가 어댑터 계층 없이 네이티브로 맞물린다. Next.js는 이 조합에 OpenNext라는 이질적 변환 계층을 추가로 얹어야 한다.
3. FR-954(설득 콘텐츠)의 실질 목적은 전통 SEO보다 **오가닉 발견성**(구글 검색 + AI 크롤러/챗봇 인용 가능성 포함)이며, 이 목적에는 CSR SPA보다 Astro의 완전 정적 HTML(아일랜드 아키텍처)이 더 적합하다. 이 요구는 앱 본체가 아니라 랜딩 한정이므로, 랜딩만 분리하는 것이 "필요한 곳에만 SSR/SSG 비용을 쓰는" 가장 저비용 해법이다.
4. 데스크톱(Tauri) 셸은 CSR 산출물을 그대로 웹뷰 콘텐츠로 재사용할 수 있어, 이 축을 데스크톱 축 결정과 별개로 두어도 마찰이 없다. 오히려 Next.js/React Router 풀프레임워크를 택하면 데스크톱용으로 별도 정적 export 모드를 다시 구성해야 해 이점이 없다.
5. i18n(react-i18next)·상태관리(useReducer 승계)·스타일(theme.css 승계)도 전환 비용 0으로 유지된다.

리스크 완화책: 랜딩(Astro)과 앱(Vite SPA)이 물리적으로 분리된 프로젝트가 되므로, 공용 디자인 토큰(색상·타이포)과 상황 칩 등 일부 재사용 컴포넌트는 별도 공유 패키지(`@sidetab/ui` 성격)로 뽑아 두 프로젝트가 import하는 구조를 설계 단계에서 확정할 것을 권고(현재 모노레포 구조상 자연스러운 확장).

## 5. 기각 대안과 사유

- **B. Next.js 전면 전환**: 랜딩 SEO/AI크롤러 노출에서는 최선이지만, (a) v1 SPA 자산 대부분을 재작성해야 하고 (b) 기존 Hono-on-Workers 백엔드와 결합하려면 OpenNext 어댑터라는 새 계층이 필요하며(Next.js 14 지원 조기 종료 등 버전 관리 부담도 확인됨) (c) 데스크톱 셸 공유를 위해 결국 별도 정적 export 모드로 되돌아가야 해, 이번 프로젝트의 "재사용성 전제"와 "포트-어댑터 유지" 제약에 정면으로 반한다. 랜딩 전용 요구는 Astro 분리로 더 저비용에 달성 가능하므로 기각.
- **C. React Router v7 Framework Mode**: 개념적으로는 매력적인 중간 지점(라우트별 SSR/SPA 선택)이나, Cloudflare 공식 템플릿(`react-router-hono-fullstack-template`)은 확인되어도 실사용·성숙도 근거가 Vite+Hono 조합만큼 축적되어 있지 않다[assumption: 대규모 채택 사례 미확인]. 프레임워크 자체를 바꾸는 마이그레이션 비용도 A안 대비 불필요하게 크다. 향후 앱 자체에 SSR이 필요해지는 시점(예: 개인화 랜딩)이 오면 재검토 후보로 남겨둘 것.
- **D. 랜딩까지 SPA로 흡수(분리 없음)**: 구현은 가장 단순하지만 FR-954의 설득 콘텐츠가 크롤러(특히 AI 크롤러)에 노출되지 않아 그 목적을 정면으로 훼손한다. 또한 AdSense 저가치 콘텐츠 리스크도 랜딩까지 전이된다. 랜딩 분리의 추가 비용(신규 프로젝트 하나)이 크지 않으므로 기각.

## 6. 리스크·추가 확인 필요

1. **AdSense 저가치 콘텐츠 정책과 free 티어 화면 배치**: 위 2.4절 리스크는 [assumption에 가까운 사실 종합]이다. 실제 화면별(좁히기/추천/상세) 광고 배치 가능 여부는 결제·수익 재설계 문서 작업 시 AdSense 공식 정책 페이지를 별도로 재확인할 것을 권고한다(이번 조사는 프레임워크 선택 목적의 정황 확인에 그침).
2. **React Router v7 + Cloudflare 템플릿의 실사용 성숙도**: 공식 템플릿 존재는 확인했으나 프로덕션 채택 사례 규모는 확인하지 못했다. A안 확정 후에도 참고용으로만 남긴다.
3. **Astro-Vite SPA 간 공유 컴포넌트/디자인 토큰 패키지화**: 이번 축의 개괄 권고사항일 뿐 구체 패키지 경계는 설계 단계 확정 필요.
4. **모바일 웹 브레이크포인트 구체 수치**(NFR-601)는 이번 축의 범위 밖(상세설계 위임, SRS §7 인계 목록에 이미 명시).
5. 상태관리(useReducer 유지 vs Zustand/Redux 등 도입)와 스타일 전략(CSS 유지 vs CSS-in-JS/Tailwind 전환)은 요청 범위상 개괄만 다뤘고, 이번 조사에서 결정하지 않았다. v1 자산 승계 전제라면 큰 화면 수 증가(세션 목록, 프로젝트, 마인드맵 등 FR-700/312) 전에 상태관리 확장성만 별도 검토 권고.

## 7. 출처 목록

- https://techsy.io/en/blog/nextjs-vs-react-vite
- https://dev.to/axibord/why-nextjs-beats-react-vite-for-spas-its-not-just-about-seo-b9g
- https://www.the90scompany.com/blog/nextjs-vs-vite-react-choosing-the-right-stack
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- https://almcorp.com/blog/google-removes-javascript-seo-warning/
- https://developers.cloudflare.com/workers/vite-plugin/tutorial/
- https://blog.cloudflare.com/full-stack-development-on-cloudflare-workers/
- https://developers.cloudflare.com/workers/framework-guides/web-apps/react/
- https://opennext.js.org/cloudflare
- https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- https://reactrouter.com/start/modes
- https://github.com/cloudflare/react-router-hono-fullstack-template
- https://dev.to/ottoaria/tauri-in-2026-build-cross-platform-desktop-apps-with-web-technologies-better-than-electron-11mo
- https://dev.to/purpledoubled/how-i-built-a-desktop-ai-app-with-tauri-v2-react-19-in-2026-1g47
- https://v2.tauri.app/plugin/updater/
- https://v2.tauri.app/distribute/sign/windows/
- https://jasonwatmore.com/add-google-adsense-to-a-single-page-app-react-angular-vue-next-etc
- https://support.google.com/adsense/thread/27854974/how-to-handle-adsense-ads-for-an-spa-single-page-app
- https://simplelocalize.io/blog/posts/react-i18next-vs-next-intl/
- https://uguraslim.com/blog/astro-react-19-islands-shipping-zero-javascript-until-user-i/
- https://migratelab.com/resources/why-astro-best-framework-marketing-sites-2026

## 부록: 로컬 사실 확인 근거

- `C:\Users\USER\Desktop\2026-하계\배경지식 사이드탭\v1\sidetab\packages\extension\package.json` — React 18.3.1, Vite 6.0.5 확인
- `C:\Users\USER\Desktop\2026-하계\배경지식 사이드탭\v2\docs\SRS-요구사항명세.md` — FR-954/2.2.1(랜딩 설득), NFR-301(익명 사용), C-16/C-17(포트-어댑터), FR-901~905(데스크톱), NFR-601~602(반응형/모바일), FR-952(4언어), TR-09(광고) 근거로 인용

## 검증 정정

**검증 방법**: 핵심 사실 주장 11건을 WebSearch/WebFetch로 독립 재검증(각 주장당 1~2개 공식 문서 또는 복수 출처 대조). 원문은 그대로 두고 아래에 정정·보강만 추가한다.

### 확인됨 (원문 그대로 신뢰 가능)
1. **Cloudflare Vite 플러그인 + Hono 단일 Worker 배포** — 공식 문서로 강하게 확인. `not_found_handling = "single-page-application"`, `vite build`가 client/server를 한 번에 산출, `wrangler deploy`가 별도 번들링 없이 그대로 배포하는 구조가 맞다. [https://developers.cloudflare.com/workers/vite-plugin/tutorial/, https://blog.cloudflare.com/introducing-the-cloudflare-vite-plugin/]
2. **OpenNext의 Next.js 14 지원 종료** — 공식 OpenNext 문서로 확인. "Next.js 16 전 마이너 + 14/15 최신 마이너만 지원, 14 지원은 2026 Q1 종료"가 그대로 맞다(검증 시점 2026-07-기준 이미 지난 일). 또한 `nodejs_compat` 호환 플래그와 2024-09-23 이후 호환성 날짜가 필수라는 점도 확인, 즉 "Node 런타임 호환 계층 필요"라는 원문 결론은 오히려 과소평가가 아니라 정확했다. [https://opennext.js.org/cloudflare, https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/]
3. **AI 크롤러(GPTBot·ClaudeBot·PerplexityBot)가 JS를 실행하지 않음** — 다수 독립 출처에서 정량 데이터로 강하게 확인(예: GPTBot 요청의 11.5%가 JS를 내려받지만 실행 안 함, ClaudeBot 23.84%도 동일, 5억 건 GPTBot 요청 분석에서 JS 실행 증거 0건). 원문 결론 유지, 오히려 근거가 더 두텁다.
4. **Google 2단계 인덱싱과 렌더링 지연** — 공식 Search Central 문서 취지와 일치, 지연폭도 "수 시간~수 주"로 원문과 부합.
5. **Tauri 2 번들 크기 (Hello World 3MB 미만 vs Electron 150MB+)** — 복수 출처로 확인(일부는 ~5MB로 약간 다르게 보고하나 자릿수 차이 결론은 동일).
6. **AdSense SPA 라우트 전환 시 `adsbygoogle.push({})` 수동 호출 필요** — 공식 AdSense 커뮤니티 답변으로 확인.
7. **AdSense 저가치(thin) 콘텐츠 정책과 "도구 위젯만 있는 페이지" 리스크** — 원문은 이를 "[assumption]에 가까운 사실 종합"이라 낮게 표기했으나, 재검증 결과 이는 낮은 신뢰가 아니라 **Google이 명시적으로 문서화한 현재 정책**이다(예: "설명 없이 계산기 위젯만 있는 페이지"가 저가치 콘텐츠의 대표 예시로 반복 인용됨). 즉 이 리스크 플래그는 원문의 자체 평가보다 신뢰도를 상향해도 된다. 결론(추천안에는 비차별 요인)은 바뀌지 않음.

### 정정 필요
8. **Tauri v2 Linux 업데이터 산출물 형식이 부정확함** — 원문 §2.3은 "Linux는 AppImage 기반 `.tar.gz`를 생성한다"고 서술했으나, 공식 문서(v2.tauri.app/plugin/updater) 확인 결과 **v2 기본 설정(`createUpdaterArtifacts: true`)에서는 `myapp.AppImage` + `myapp.AppImage.sig`를 직접 생성하며 tar.gz로 감싸지 않는다.** tar.gz 래핑은 `createUpdaterArtifacts: "v1Compatible"`(레거시 호환 모드)를 명시적으로 켰을 때만 발생한다. 서명 필수·비활성화 불가라는 나머지 서술은 정확함. [https://v2.tauri.app/plugin/updater/] — 결론(데스크톱 셸 관점의 A안 우위)에는 영향 없음, 세부 사실 정정.
9. **react-i18next vs next-intl 주간 다운로드 수치가 상당히 과소 추정됨** — 원문은 "약 280만 vs 약 90만"으로 인용했으나, npm 레지스트리 API로 직접 재조회(검증일 기준 2026-07-13~19주)한 실측값은 **react-i18next 13,935,231 vs next-intl 4,526,020**로, 두 패키지 모두 원문 대비 약 5배 높다. 다만 **비율(react-i18next가 약 3배 우위)과 방향성(SPA에는 react-i18next가 여전히 압도적으로 우세)은 원문 결론과 동일하게 유지**된다. 절대 수치만 오래된/부정확한 스냅숏으로 보이며 판단(§2.5, i18n 전환 비용 축)에는 영향 없음.
10. **React Router 버전이 v7이 아니라 v8로 이미 넘어감** — 2026-06-17 React Router v8이 정식 출시됨(연 1회 메이저 릴리스 체계 첫 적용). v7→v8은 **비파괴적(non-breaking) 업그레이드**이며 Framework Mode·`ssr:false` 라우트별 지정 등 원문이 서술한 동작은 v8에서도 그대로 유지된다(단, Node 22.22+/React 19.2.7+/Vite 7+ 요구로 상향). 원문의 "React Router v7"이라는 축 이름은 검증 시점 기준 최신 버전명이 아니므로 "React Router v7/v8 Framework Mode"로 갱신하는 게 정확하나, 평가축 자체의 결론에는 영향 없음.
    - 부수 확인: `cloudflare/react-router-hono-fullstack-template`는 실재하는 공식 Cloudflare 템플릿(리포지토리 존재, "Deploy to Cloudflare" 버튼 포함)이나 **커밋 1개, 스타 16개**로 실사용 축적이 거의 없음을 직접 확인했다. 이는 원문 §2.2/§5의 "실사용 사례·성숙도 미검증" 판단을 오히려 더 강하게 뒷받침한다(추측이 아니라 실측 확인).

### 누락된 유력 대안
11. **TanStack Start가 후보 목록(A/B/C/D)에서 누락됨.** TanStack Router+Vite 기반 풀스택 React 프레임워크로, Cloudflare가 공식 문서(`developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/`)를 통해 Nitro 어댑터 기반 네이티브 Cloudflare Workers 배포를 지원한다고 명시한다. Next.js/OpenNext처럼 별도 변환 어댑터 계층 없이 Vite net Cloudflare Workers·Node·기타 타겟에 동일 산출물을 배포할 수 있다는 점에서, 원문이 Next.js를 기각한 핵심 사유("어댑터 이질성")를 상당 부분 회피하는 후보다. 다만 (a) v1 SPA 자산을 라우트 로더 기반 모델로 재작성해야 하는 마이그레이션 비용은 옵션 C(React Router)와 동급이고, (b) 2026년 기준 RC(release candidate) 단계로 공식 문서 자체가 "확신 없으면 Next.js가 기본 선택"이라 권고할 정도로 生태계 성숙도가 낮다. **결론에는 영향 없음**(A안 대비 우위 근거 없음, 오히려 C와 유사한 마이그레이션·성숙도 리스크를 안음)이나, §5 기각 대안 목록에 누락되어 있었다는 점은 완결성 결함으로 기록해 둔다.

### 추천 유지 여부 판정
**A안(Vite SPA 유지 + Astro 랜딩 분리) 추천은 그대로 유지된다.** 정정 8~10건은 세부 수치·버전명 보정이며 어느 것도 축별 평가표의 순위를 뒤집지 않는다. 오히려 7번(AdSense 저가치 리스크의 신뢰도 상향)과 10번 부수확인(React Router 템플릿 실사용 부재 실측)은 원문의 신중한 판단을 강화하는 방향이다. 11번(TanStack Start 누락)은 완결성 지적이지 추천을 뒤집는 근거는 아니다(RC 단계·마이그레이션 비용이 C안과 동급).
