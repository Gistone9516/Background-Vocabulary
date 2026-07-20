# 축4: 코드 공유·저장소 전략 (웹 + 데스크톱 + 향후 모바일 웹)

담당 범위: 모노레포 도구 선택, 데스크톱 셸과 웹의 UI 코드 공유 패턴, 포트-어댑터 경계를 빌드에서 강제하는 방법(SRS NFR-505), TypeScript 프로젝트 레퍼런스, v1 구조에서의 진화 경로.

---

## 0. v1 현재 상태 (코드 직접 확인, 2026-07-21)

`v1/sidetab/` 실사 결과:

- **패키지 매니저**: npm workspaces (`package.json`의 `workspaces` 필드), `package-lock.json` 존재. pnpm-lock.yaml 없음 — **pnpm이 아니라 npm workspaces**를 쓰고 있다.
- **구조**: `packages/{shared, core, adapters/{workers, search-providers, lambda}, extension, scripts}`.
  - `packages/adapters/lambda`는 **빈 디렉터리**(파일 없음) — "어댑터만 추가하면 Lambda로 이식 가능"이라는 하드 제약은 아직 코드로 실증되지 않은 미검증 주장이다.
- **빌드 오케스트레이션**: 루트 `package.json`의 `"typecheck": "tsc -b"`가 있으나 **루트에 `references`를 가진 tsconfig.json이 없다**(있는 건 `tsconfig.base.json`, `tsconfig.check.json`뿐). `tsc -b`가 참조 그래프 없이 정상 동작할 수 없으므로 이 스크립트는 사실상 미완성/미사용 상태로 보인다. 즉 **TypeScript 프로젝트 레퍼런스(composite build)는 아직 도입되지 않았다.**
- **경계 강제 방식**: `packages/scripts/portability-guard.mjs` — dependency-cruiser 등 기성 도구가 아니라 **직접 짠 정규식 기반 스크립트**. `core/`, `shared/` 디렉터리를 순회하며 `hono` import, `adapters` import, `caches.default`, `ctx.waitUntil`, `KVNamespace`, `DurableObject`, `process.env`, `__dirname`, `require()` 등 런타임 전용 토큰을 라인 단위 정규식으로 금지한다. `npm run check`가 `tsc --noEmit -p tsconfig.check.json && node .../portability-guard.mjs`를 실행해 CI/로컬에서 게이트로 동작.
  - 한계: 정규식 기반이라 AST 기반 도구보다 우회에 약함(예: 문자열 결합으로 만든 `"proc" + "ess.env"` 같은 난독화는 못 잡지만 실제로는 팀 내부 실수만 잡으면 되므로 위험은 낮음). import 대상 패키지 화이트리스트가 아니라 금지 토큰 블랙리스트 방식이라 새 런타임 API가 추가될 때마다 수동 갱신 필요.
- **패키지 간 참조**: `@sidetab/core`가 `@sidetab/shared`에 package.json dependency로 의존, tsconfig의 `paths`로 `@sidetab/shared` 별칭을 소스 파일(`.ts`)에 직접 매핑(빌드 산출물이 아니라 소스 참조 — devDependency 방식). `extension`(웹 확장 UI)도 동일하게 `@sidetab/shared`에 paths 별칭.
- **UI 공유 범위**: 현재는 `extension` 패키지 하나만 있고(크롬 확장 사이드패널), 데스크톱/웹사이트용 별도 UI 패키지는 없다. 즉 "UI까지 공유"할지 "도메인 로직만 공유"할지는 아직 결정된 바 없는 백지 상태 — 이번 배경노트 v2의 데스크톱+웹 확장 요구가 처음 이 결정을 요구한다.

---

## 1. 후보 비교 — 모노레포 도구

| 후보 | 개요 | 장점 | 단점 | 이 프로젝트 적합성 |
|---|---|---|---|---|
| **A. npm workspaces 유지** (v1 현행) | Node 내장, 별도 설치 불필요 | 이미 동작 중, 학습비용 0, 전환비용 0 | hoisting이 느슨해 phantom dependency 위험, 설치 속도 느림, `workspace:*` 프로토콜 없음, 필터링(`--filter`) 없음 [fact-cited] | 패키지 6개 규모에선 당장 안 깨지지만 데스크톱 패키지 추가로 8~10개 이상 되면 관리비용 증가 |
| **B. pnpm workspaces** | content-addressable store, strict hoisting, `workspace:*` | 설치 2~3배 빠름·디스크 사용량 대폭 감소(레포 기준 2GB→600MB 사례 보고), 패키지가 선언 안 한 의존성을 우연히 쓰는 걸 원천 차단(strict), `--filter`로 부분 실행 [fact-cited] | 마이그레이션에 lockfile 재생성 필요, Cloudflare Workers/Wrangler 생태계와의 호환성은 실사용 확인 필요 | Vue·Vite·Nuxt·Astro·Turborepo가 pnpm을 기본 채택 [fact-cited] — 생태계 표준에 가까움 |
| **C. pnpm + Turborepo** | pnpm 위에 태스크 캐싱·파이프라인 오케스트레이션 추가 | 증분 빌드/캐시로 CI 단축, 설정이 Nx보다 가벼움, 5~50개 패키지 규모에 적합 [fact-cited] | 아키텍처 경계 강제 기능은 없음(별도 도구 필요), 프로젝트 그래프 추적이 Nx보다 얕음(파일 변경 단위, import 단위 아님) [fact-cited] | 패키지 수가 적은 지금 단계에선 이득이 제한적이나 데스크톱+웹+모바일웹으로 늘면 CI 시간 절감 효과 커짐 |
| **D. pnpm + Nx** | 풀 모노레포 플랫폼(태스크 그래프, 코드 생성, 태그 기반 경계 강제) | `@nx/enforce-module-boundaries`로 태그 기반 의존 규칙을 ESLint로 강제(§3 참조), TS 프로젝트 레퍼런스 네이티브 지원(`@nx/js`), affected 명령이 실제 TS import를 추적해 turborepo보다 정밀 [fact-cited] | 개념·설정 오버헤드 큼(project.json, 태그 체계, 플러그인), 여러 팀·여러 앱 유형·엄격한 아키텍처 경계가 필요한 규모에서 정당화됨 [fact-cited] — 1인 내지 소수 개발 단계엔 과잉 | 미래 확장(모바일 웹, 여러 어댑터) 시점엔 후보지만 지금은 과잉 설계 위험 |
| **E. moonrepo** | Rust 기반 빌드 시스템, 언어 무관 | TS 프로젝트 레퍼런스 가이드를 공식 제공 [fact-cited] | 국내외 채택 사례가 Nx/Turborepo 대비 적음, 이 팀의 기존 스택(Node/npm 생태계)과의 통합 검증 자료 상대적으로 적음 | 조사 근거 얕음 — 채택 안 함, 참고만 |

**중간 판단**: 이 프로젝트는 아직 "6개 패키지, 사실상 1~2인 개발" 규모다. Nx 수준의 무게는 지금 정당화되지 않는다. 그러나 npm workspaces의 설치 속도·strict dependency 이슈는 데스크톱 패키지(Electron/Tauri) 추가 시 네이티브 모듈 의존성까지 더해지면 체감된다.

---

## 2. 후보 비교 — 데스크톱 셸과 웹의 UI 코드 공유 패턴

축1(데스크톱 셸 자체 선택: Electron/Tauri/Wails 등)은 다른 담당이지만, 어느 셸이든 "웹뷰가 웹 코드를 그대로 로드하는가" 여부가 공유 패턴을 가른다.

| 패턴 | 설명 | 장점 | 단점 |
|---|---|---|---|
| **P1. UI까지 통째 공유** (단일 `packages/ui` 또는 `packages/webapp`를 확장·데스크톱·웹사이트가 모두 로드) | React 사이드패널/웹앱 코드를 하나의 패키지로 두고, 크롬 확장은 `chrome.*` 어댑터를, 데스크톱은 OS 어댑터(전역 단축키·알림·파일시스템)를 각각 주입 | 화면 리팩토링이 한 곳만 수정하면 3개 플랫폼에 반영, Tauri/Electron 둘 다 "웹 기술로 만든 프론트엔드를 그대로 로드"하는 것이 검증된 표준 패턴(Tauri 공식 가이드가 Next.js 앱을 그대로 데스크톱에 얹는 모노레포 구조를 제시)[fact-cited] | 크롬 확장(사이드패널, `manifest.json`, chrome API)과 데스크톱 앱(별도 윈도우, OS API)은 셸 자체의 구동 방식이 달라 완전한 컴포넌트 재사용보다는 "화면/로직 재사용 + 셸 진입점만 다름" 구조가 현실적 |
| **P2. 도메인 로직만 공유, UI는 플랫폼별 별도 구현** (v1 현행 확장형) | `core/shared`만 공유, 확장 UI·데스크톱 UI·웹사이트 UI를 각각 새로 작성 | 플랫폼별 UX 최적화 자유도 높음, 셸 특이사항(Manifest V3 사이드패널 API 등)에 얽매이지 않음 | UI 변경 시 N배 작업, 화면 로직(SSE 스트리밍 렌더링, 취소 처리 UI 등) 중복 구현·중복 버그 위험 — 배경노트가 요구하는 "3플랫폼 연속성" 요구와 정면으로 충돌 |
| **P3. 절충 — 화면(screens)/훅(hooks)은 공유 패키지, 셸 진입점(entry)만 플랫폼별** | `packages/ui-shared`에 화면 컴포넌트·상태 훅·SSE 클라이언트를 두고, `packages/extension`(manifest+sidepanel.html), `packages/desktop`(Electron/Tauri 셸), `packages/web`(웹사이트)은 각각 얇은 진입점 + 플랫폼 어댑터(알림, 단축키, 파일첨부)만 구현 | P1의 재사용 이득과 P2의 셸 자유도를 절충. core/shared의 포트-어댑터 원칙을 UI 레이어까지 동일하게 연장(UI는 웹표준 API+props로만 작성, 플랫폼 API는 어댑터 주입) | 화면 코드가 "어느 플랫폼에서도 도는" 수준으로 순수하게 작성돼야 하므로 초기 설계 노력이 P2보다 큼 |

**권고**: **P3**. 이유: 이미 core/shared에 적용 중인 포트-어댑터 원칙(런타임 종속은 adapters에만)을 UI 레이어까지 동일한 사고방식으로 연장하는 것이라 팀의 기존 아키텍처 규율과 정합적이고, 배경노트의 "화면 로직 자유도"(사이드패널 특유의 UX, 담은 어휘 패널 등 v1에 이미 존재하는 정교한 UI 로직)를 잃지 않는다. P1(완전 통합)은 크롬 확장 Manifest V3 사이드패널이라는 셸 특이 API가 이미 깊이 박혀 있어(사이드패널 진행바, 오로라 애니메이션 등) 지금 와서 완전 통합하면 회귀 위험이 크다.

---

## 3. 포트-어댑터 경계를 빌드에서 강제하는 방법 (SRS NFR-505)

| 후보 | 방식 | 장점 | 단점 |
|---|---|---|---|
| **A. 현행 유지: 커스텀 정규식 가드** (`portability-guard.mjs`) | 라인 단위 정규식으로 금지 토큰 검사 | 이미 동작 중, 의존성 0(외부 패키지 불필요), 로직이 짧아 전원이 읽고 이해 가능 | AST가 아니라 텍스트 매칭이라 오탐/누락 가능성 존재, "adapters에서 core/shared로의 역참조" 같은 그래프형 규칙은 표현 못 함(현재는 개별 토큰 금지만) |
| **B. dependency-cruiser 추가/대체** | `.dependency-cruiser.js`에 `from`/`to` 경로 패턴으로 순환·금지 의존 규칙 선언, CI에서 `depcruise` 실행 시 실패 | 실제 import 그래프 기반(AST)이라 텍스트 매칭보다 정확, 시각화(그래프 이미지) 가능, "core → adapters import 금지" 같은 그래프형 규칙을 선언적으로 표현 가능, PR이 아키텍처 규칙 위반 시 실패하도록 CI 통합이 표준 관행 [fact-cited] | 별도 devDependency, 설정 문법 학습 필요(다만 간단한 forbidden 규칙 몇 개면 충분) |
| **C. eslint-plugin-boundaries** | ESLint 룰로 레이어 태그를 정의하고 허용 의존 관계를 선언 | 편집기에서 즉시 피드백(빌드 실패를 기다릴 필요 없이 타이핑 중 바로 표시), 기존 ESLint 워크플로에 자연 통합 | dependency-cruiser 대비 그래프 시각화 없음, 소규모 프로젝트엔 두 도구 병행이 과할 수 있음 |
| **D. Nx enforce-module-boundaries** | 태그 기반(`scope:`, `type:`) 의존 제약을 ESLint 룰로 강제 | 가장 정교(태그 조합, allSourceTags 등), TS 프로젝트 레퍼런스와 통합 | Nx 전체 도입이 전제 — §1에서 과잉 설계로 판단한 도구에 종속됨 |
| **E. TypeScript 프로젝트 레퍼런스(composite build)** | 각 패키지에 `composite: true` + 루트에 `references` 그래프, `tsc -b`로 빌드 | 컴파일러 차원에서 "명시적으로 참조 선언 안 한 패키지는 import 자체가 타입 에러" — 포트-어댑터 경계의 **가장 강한 형태**(빌드 자체가 안 됨). 증분 빌드로 대형 프로젝트 컴파일 시간 단축(11분→3분 사례 보고)[fact-cited] | v1엔 아직 없음(§0). composite 옵션은 `rootDir`/`include` 규칙이 엄격해져 마이그레이션 손이 감 |

**권고**: **A(유지) + B(추가) + E(도입) 3중 병행**, D는 보류.
- **A는 그대로 둔다**: 이미 잘 동작하고, Workers 전용 API(`caches.default`, `ctx.waitUntil` 등) 같은 "그래프로는 안 잡히는 런타임 전용 토큰 금지"는 정규식 방식이 오히려 더 직접적이다. dependency-cruiser로 완전 대체하면 이 세부 규칙들을 재구현해야 해서 손실.
- **B(dependency-cruiser)를 추가**한다: A가 못 잡는 "패키지 간 import 그래프 형태의 위반"(예: `core`가 `adapters/workers`를 직접 import하는 실수, 순환 의존)을 AST 기반으로 보완. `npm run check`에 `depcruise` 단계를 추가하는 형태로 낮은 비용에 붙일 수 있다.
- **E(TS 프로젝트 레퍼런스)를 도입**한다: v1의 `tsc -b`가 이미 스크립트로 존재하지만 실제로 작동하지 않는 미완성 상태(§0)이므로, 이번 v2 설계에서 완성시키는 것이 "포트-어댑터 경계를 빌드에서 강제"라는 요구사항에 가장 직접적으로 부합한다 — composite 프로젝트 그래프 자체가 "shared는 core를 참조 못 함" 같은 방향성을 컴파일 타임에 강제한다.
- D(Nx)는 §1 결론과 동일 이유로 지금은 보류, 패키지 수가 늘어(데스크톱+모바일웹 어댑터 추가로 10개 이상) 관리 부담이 커지면 재검토.

---

## 4. TypeScript 컴파일러 참고 (부수 사실, [fact-cited])

- TypeScript 7.0(별칭 tsgo, Go 네이티브 포트)이 2026-04-21 베타, 2026-06-18 RC 발표. 타입체크(`--noEmit`) 기준 프로덕션급으로 시연되며 6.0 대비 약 10배 속도 향상을 주장. 단, 프로그래밍 API 안정화는 7.1 이후로 예정. [fact-cited]
- 참고만 하고 **이번 도입 결정에는 반영하지 않음**(RC 단계, API 미안정 — 위험도 대비 이득이 이 프로젝트 규모에서 크지 않음). 프로젝트 레퍼런스 자체는 표준 `tsc -b`로 충분히 도입 가능하며, tsgo 전환은 GA 이후 별도 검토 과제로 남긴다.

---

## 5. v1 → v2 진화 경로 (권고안)

1. **패키지 매니저**: npm workspaces → **pnpm workspaces**로 전환(lockfile 재생성, `workspace:*` 프로토콜 채택). 근거: 데스크톱 패키지(Electron/Tauri 네이티브 바인딩) 추가 시 npm의 느슨한 hoisting이 phantom dependency 위험을 키우고, 생태계 표준(Vite/Wrangler 계열 도구 다수가 pnpm 우선 지원)과의 정합성이 낫다[fact-cited].
2. **빌드 오케스트레이션**: 지금 단계는 **Turborepo·Nx 도입 보류**, npm scripts(또는 pnpm `-r`/`--filter`)로 충분. 패키지가 10개를 넘거나 CI 시간이 체감되게 늘면 그때 Turborepo부터 검토(Nx는 팀 규모·아키텍처 복잡도가 실제로 요구할 때만).
3. **TS 프로젝트 레퍼런스 완성**: 루트 `tsconfig.json`에 `references`를 채워 `tsc -b`를 실제로 작동시킨다. `packages/{shared, core, adapters/*, extension, desktop, web}` 각각 `composite: true`. 이것으로 포트-어댑터 방향성(shared→core→adapters 단방향)이 컴파일 타임에 강제된다.
4. **경계 가드 이중화**: 기존 `portability-guard.mjs` 유지 + `dependency-cruiser` 규칙 추가(순환 의존·역참조 탐지). `npm run check`(또는 `pnpm check`)에 두 단계 모두 게이트로 포함.
5. **UI 공유 패키지 신설**: `packages/ui-shared`(가칭)에 화면·훅·SSE 클라이언트를 이관, `extension`/`desktop`/`web`은 각각 셸 진입점 + 플랫폼 어댑터만 유지(P3 패턴, §2).
6. **아직 비어 있는 `packages/adapters/lambda`**: 코드 공유 관점에서는 "포트-어댑터가 실제로 두 번째 런타임에서 검증된 적 없다"는 미검증 리스크로 기록해 둔다(§6).

---

## 6. 리스크 및 확인 필요 사항

- **[리스크] 포트-어댑터 이식성 미검증**: `packages/adapters/lambda`가 빈 디렉터리라 "Workers→Lambda 어댑터 추가만으로 이식 가능"이라는 v1의 핵심 주장이 실제 코드로 실증된 바 없다. AWS 채택 축(사용자의 Cloud OP 평가 축)과 맞물려, 이 검증이 실제로 이뤄지는지가 포트폴리오 가치의 핵심 — 축1/축2 담당과 조율 필요.
- **[확인 필요] pnpm과 Wrangler/Cloudflare Workers 툴체인의 실제 호환성**: 이번 조사에서 일반론(생태계가 pnpm 선호)은 확인했으나, 이 프로젝트의 정확한 Wrangler 버전·구성에서 pnpm 전환이 무마찰인지는 실제 마이그레이션 스파이크로 확인 필요(문서 조사만으로는 불충분).
- **[확인 필요] Electron/Tauri 중 어느 쪽이든 "웹 코드 그대로 로드" 전제가 유지되는지**: 축1에서 최종 데스크톱 셸이 정해진 뒤, UI 공유 패키지(P3)의 인터페이스가 그 셸의 IPC/권한 모델과 충돌 없는지 재확인 필요.
- **[낮은 확신, 참고용]** 이번 검색 결과 상당수가 SEO성 블로그(pkgpulse, tech-insider, digitalapplied 등 2026년 신생 도메인)로 사실 서술의 출처 품질이 공식문서(TypeScript 공식 핸드북, Nx 공식 문서, GitHub 리포)보다 낮다. 표에서 공식문서 인용과 블로그 인용을 분리해 표기했으며, 수치(설치 속도 배수, 디스크 용량, CI 시간)는 블로그 출처라 참고치로만 취급할 것.

---

## 출처

- [pnpm Workspaces 공식 문서](https://pnpm.io/workspaces)
- [Best Monorepo Tools 2026: Turborepo, Nx, pnpm & Lerna Compared](https://devtoollab.com/blog/best-monorepo-management-tools)
- [When should I choose pnpm over npm for a monorepo — GitHub Discussion](https://github.com/orgs/community/discussions/195562)
- [Workspaces and Monorepos in Package Managers | Andrew Nesbitt](https://nesbitt.io/2026/01/18/workspaces-and-monorepos-in-package-managers.html)
- [Monorepo in 2026: Turborepo vs Nx vs Bazel | daily.dev](https://daily.dev/blog/monorepo-turborepo-vs-nx-vs-bazel-modern-development-teams/)
- [Turborepo vs Nx: I Migrated a Monorepo Twice to Compare](https://navanathjadhav.medium.com/turborepo-vs-nx-i-migrated-a-monorepo-twice-to-compare-38e95e434273)
- [Monorepo Strategy 2026: Turborepo vs Nx Decision Guide](https://www.digitalapplied.com/blog/monorepo-strategy-2026-turborepo-nx-decision-matrix)
- [dependency-cruiser rules-reference (GitHub 공식)](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)
- [Avoid Cross Module Dependencies with Dependency Cruiser](https://dev.to/jacobandrewsky/avoid-cross-module-dependencies-with-dependency-cruiser-3b0b)
- [Three Ways to Enforce Module Boundaries and Dependency Rules in an Nx Monorepo](https://www.stefanos-lignos.dev/posts/nx-module-boundaries)
- [Nx 공식: Enforce Module Boundaries ESLint Rule](https://nx.dev/docs/technologies/eslint/eslint-plugin/guides/enforce-module-boundaries)
- [Nx Blog: Taming Code Organization with Module Boundaries in Nx](https://nx.dev/blog/mastering-the-project-boundaries-in-nx)
- [Tauri in 2026: Build Cross-Platform Desktop Apps with Web Technologies](https://dev.to/ottoaria/tauri-in-2026-build-cross-platform-desktop-apps-with-web-technologies-better-than-electron-11mo)
- [Tauri v2 with Next.js: A Monorepo Guide](https://melvinoostendorp.nl/blog/tauri-v2-nextjs-monorepo-guide)
- [Best Desktop App Frameworks 2026 | PkgPulse](https://www.pkgpulse.com/guides/best-desktop-app-frameworks-2026)
- [TypeScript 공식 핸드북: Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)
- [TypeScript Project References: 11-Minute Builds Down to 3](https://dev.to/gabrielanhaia/typescript-project-references-11-minute-builds-down-to-3-2kif)
- [Nx Blog: Everything You Need to Know About TypeScript Project References](https://nx.dev/blog/typescript-project-references)
- [moonrepo: TypeScript project references 공식 가이드](https://moonrepo.dev/docs/guides/javascript/typescript-project-refs)
- [eslint-plugin-boundaries 소개](https://open-awesome.com/projects/eslint-plugin-boundaries)
- [TypeScript 7.0 Beta 공식 발표 (devblogs.microsoft.com)](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-beta/)
- [TypeScript 7.0 RC 공식 발표 (devblogs.microsoft.com)](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0-rc/)
- [microsoft/typescript-go 공식 리포](https://github.com/microsoft/typescript-go)
- [Microsoft steers native port of TypeScript to early 2026 release | InfoWorld](https://www.infoworld.com/article/4100582/microsoft-steers-native-port-of-typescript-to-early-2026-release.html)

---

## 검증 정정

핵심 사실 주장 8건 이상을 WebSearch/WebFetch로 독립 재검증함(2026-07-21 기준). 원문은 그대로 두고 아래에 정정만 추가.

### 1. [정정, 확신 높음] TypeScript 7.0 상태 — 문서가 "RC 단계"로 서술했으나 실제로는 이미 GA(정식 출시)
- §4·§5가 "TypeScript 7.0(tsgo)이 2026-04-21 베타, 2026-06-18 RC"까지만 서술하고 "RC 단계, API 미안정"을 근거로 도입 보류를 권고했으나, **TypeScript 7.0은 2026-07-08에 이미 GA(정식 출시)됐다**(devblogs.microsoft.com 공식 발표, RC 이후 약 3주 만). 문서 작성일(§0에 기재된 2026-07-21) 기준으로는 이미 2주 전에 GA된 구버전 정보다.
- 다만 **"프로그래밍 API(compiler API) 안정화는 7.1 이후"라는 문서의 핵심 근거는 여전히 유효**하다(devblogs.microsoft.com 공식 확인: 7.0은 안정된 programmatic API 없이 출시, Vue/Svelte/Astro 같은 템플릿 타입체크 도구는 7.1까지 TS7을 못 씀). 성능 수치도 문서의 "10배"보다 공식 발표 후속 보도가 더 크게(8~12배, VS Code 코드베이스 125.7초→10.6초=11.9배) 보고함.
- **추천 영향**: 없음. "이번 도입 결정에는 반영하지 않음"이라는 §4의 결론은 GA 여부와 무관하게 유지된다(근거가 "RC라서"가 아니라 "안정 API가 없어서"였어야 더 정확했을 뿐). 다만 서술 자체는 시점 오류이므로 정정 필요.

### 2. [정정, 확신 높음] Tauri "공식 가이드"가 모노레포 구조를 제시한다는 서술은 과장
- §2 P1 행이 "Tauri/Electron 둘 다... 검증된 표준 패턴(Tauri 공식 가이드가 Next.js 앱을 그대로 데스크톱에 얹는 모노레포 구조를 제시)"라고 인용하나, 공식 Tauri v2 Next.js 가이드(v2.tauri.app/start/frontend/nextjs/)를 직접 확인한 결과 **단일 Next.js 앱을 Tauri 셸에 연결하는 기본 설정(static export 요구사항, 설정 파일 수정)만 다루고, 모노레포·워크스페이스 구조는 다루지 않는다.**
- 모노레포 구조를 다루는 자료는 melvinoostendorp.nl 블로그 글과 Arbarwings/tauri-v2-nextjs-monorepo GitHub 템플릿이며, 이는 **커뮤니티 자료이지 Tauri 공식 문서가 아니다.** 출처 목록(96번째 줄)에도 이 두 개는 이미 별도로 올라와 있어 완전히 없는 근거는 아니지만, 본문에서 "공식 가이드가 제시"라고 묶어 쓴 것은 출처 성격을 오도한다.
- **추천 영향**: 없음. P3 권고(§2)는 이 사실 하나에 의존하지 않고 "크롬 확장 Manifest V3 API가 이미 깊이 박혀 있다"는 v1 실사 근거로 서 있다. "웹 코드를 그대로 로드하는 것 자체는 Tauri/Electron 양쪽에서 흔한 패턴"이라는 방향성은 커뮤니티 사례로도 충분히 뒷받침되므로 판단은 유지되나, 인용 정확도만 낮다.

### 3. [정정, 확신 중간] Nx `enforce-module-boundaries` + TS 프로젝트 레퍼런스 통합은 알려진 결함 있음
- §1·§3의 candidate D가 Nx의 장점으로 "TS 프로젝트 레퍼런스 네이티브 지원"을 들었으나, **GitHub 공식 이슈(nrwl/nx #31286, 열려 있음)**에 따르면 패키지 매니저 workspace linking + TS 프로젝트 레퍼런스 조합을 쓸 때 `@nx/enforce-module-boundaries`가 워크스페이스 루트에서 실행하면 위반을 잡지만 **하위 디렉터리에서 실행하면 위반을 못 잡는** 알려진 버그가 있다. "통합됨"이라는 서술은 사실이되 완전 무결은 아니다.
- **추천 영향**: 없음. D(Nx)는 이미 §1·§3에서 "지금은 보류"로 결론 났고, 이 결함은 그 보류 판단을 오히려 보강하는 방향(Nx가 겉보기만큼 매끈하지 않음)이라 추천이 바뀌지 않는다.

### 4. [보강, 확신 중간] pnpm-Wrangler 호환성 리스크가 문서의 "확인 필요" 태그보다 구체적으로 존재
- §6이 이미 "실제 마이그레이션 스파이크로 확인 필요"로 낮춰 두었는데, 재검증 결과 이 우려는 추상적 가능성이 아니라 **실제 열린 이슈로 뒷받침된다**: cloudflare/workers-sdk #10236("`wrangler dev` fails only with `pnpm`"—Next.js 프로젝트에서 middleware-manifest.json dynamic require 실패)과 과거 이슈 #777("Support PNPM?"). Wrangler는 pnpm을 공식 지원하지만(`pnpm add -D wrangler`), pnpm의 `node_modules/.pnpm` 중첩 구조와 프레임워크별 모듈 해석이 충돌하는 사례가 실재한다.
- **추천 영향**: 없음. §6의 "확인 필요" 판정 자체가 이미 정확했고, 이번 재검증은 그 경계심의 근거를 강화할 뿐 방향을 바꾸지 않는다. pnpm 전환 전 마이그레이션 스파이크를 반드시 거치라는 권고를 더 강하게 유지할 것.

### 5. [누락 대안] Rush(마이크로소프트)가 후보 비교(§1)에서 빠짐
- §1 후보 표(A~E)에 npm workspaces·pnpm·pnpm+Turborepo·pnpm+Nx·moonrepo만 있고, **대규모 TypeScript 모노레포를 위해 마이크로소프트가 직접 만든 Rush(rushjs.io)가 없다.** Rush는 pnpm을 내부 설치 엔진으로 써서 phantom dependency를 제거하고, 의존성 버전 일관성 강제·신규 의존성 리뷰 같은 "정책형" 보드 기능이 있어 NFR-505(경계 강제)와 결이 닿는 후보다.
- 다만 Rush의 핵심 가치는 "다중 패키지 배포·퍼블리싱 워크플로 정책"(라이브러리를 여러 개 배포하는 대기업형 모노레포)에 있고, 이 프로젝트는 배포형이 아니라 애플리케이션형(확장+데스크톱+웹이 한 제품)이라 Rush의 강점이 정확히 맞아떨어지진 않는다. Yarn Berry(PnP)도 검토 결과 pnpm 대비 뚜렷한 이점이 없어(IDE/TS 툴링 호환성이 pnpm보다 낮음) 후보에서 빠진 것은 합리적이다.
- **추천 영향**: 없음(낮은 확신). Rush를 후보에 추가했어도 "6개 패키지, 1~2인 개발" 규모 판단상 pnpm workspaces 단독 채택 결론이 바뀔 근거는 약하나, 향후 배포 정책이 필요해지면(예: 여러 어댑터 패키지를 외부에 공개 배포) 재검토 대상으로 기록할 가치는 있음.

### 6. [확인됨, 정정 없음] 그 외 핵심 주장
- pnpm이 npm 대비 설치 2~3배 빠르고 디스크 50~70% 절감: 다수 출처에서 일관되게 확인(정확한 "2GB→600MB" 수치 자체는 재확인 못했으나 보고된 범위 안, 낮은 확신으로 원문 유지).
- Turborepo가 5~50개 패키지 규모에 적합, Nx는 20개 이상·아키텍처 경계·폴리글랏 필요 시: 확인됨(단, 임계값을 "20개"로 보는 출처도 많아 "5~50"은 다소 관대한 쪽 수치 — 낮은 확신 표기 권장).
- dependency-cruiser의 CI 게이트화가 표준 관행이라는 주장: 확인됨(PR이 아키텍처 위반 시 실패하도록 하는 것이 일반적 관행).

**최종 판정: 추천 유지.** 위 6건 중 4건은 인용 정확도·시점 오류 정정(추천에 영향 없음), 1건은 기존 리스크 태그를 보강, 1건은 누락 대안 기록(추천 미변경, 향후 재검토용 메모). §1/§2/§3/§5의 핵심 권고(pnpm 전환, Turborepo/Nx 보류, A+B+E 3중 병행, P3 UI 패턴)는 모두 그대로 유지 가능.
