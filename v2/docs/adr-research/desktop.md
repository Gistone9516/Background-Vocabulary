# 축1: 데스크톱 셸 — Tauri vs Electron vs Wails (2026-07 기준)

조사자 주석: 모든 사실 주장은 WebSearch로 출처 확보. 출처 없는 판단성 서술은 [assumption]으로 표기.

## 0. 후보 개요

| 후보 | 언어/런타임 | 렌더링 엔진 |
|---|---|---|
| **Tauri v2** | Rust 백엔드 + 웹뷰(WRY) 프론트 | OS 네이티브 웹뷰(Windows=WebView2/Edge, Linux=WebKitGTK, macOS=WKWebView) |
| **Electron** | Node.js 백엔드 + Chromium 프론트 | 번들 Chromium(전 OS 동일 버전) |
| **Wails v2** | Go 백엔드 + 웹뷰 프론트 | OS 네이티브 웹뷰(Tauri와 동일 원리) |

Tauri가 현재 데스크톱 셸 논의의 사실상 기준점이라 Electron·Wails를 이에 대비하는 구성으로 서술함.

## 1. Windows·Linux 배포 형식

**Tauri v2**
- Windows: MSI, NSIS(.exe) 번들러 내장. [fact-cited]
- Linux: `.deb`, `.rpm`, AppImage 3종 공식 지원. [fact-cited](https://v2.tauri.app/distribute/debian/, https://v2.tauri.app/distribute/rpm/, https://v2.tauri.app/distribute/appimage/)
- 배포판별 크기 차이가 큼: `.deb`/`.rpm`은 WebKitGTK를 시스템 의존성으로 선언해 패키지 자체는 ~4MB인 반면, AppImage는 WebKitGTK 런타임을 내장해 ~76MB로 커짐(구버전 배포판 호환을 위해). [fact-cited](https://github.com/orgs/tauri-apps/discussions/10026)
- glibc 버전 함정: 최신 빌드 환경(예: 최신 Ubuntu)에서 빌드하면 그 glibc 버전이 최소 요구치로 박혀, 더 오래된 배포판에서 `GLIBC_2.33 not found` 류 런타임 에러 발생 가능. 오래된 베이스 이미지(Ubuntu 22.04, Debian 12 등)에서 빌드하는 것이 권장됨. [fact-cited](https://ostechnix.com/tauri-framework-build-and-package-lightweight-applications/)
- AppImage 빌드 자체의 신뢰성 이슈가 보고됨(일부 개발자가 여러 시도에도 AppImage 빌드에 실패한 사례), ARM AppImage는 크로스컴파일 불가(ARM 기기/에뮬레이터에서만 빌드 가능). [fact-cited](https://github.com/tauri-apps/tauri/issues/14796)

**Electron**
- Windows: NSIS(.exe), MSI 가능(electron-builder 경유). Squirrel.Windows는 electron-builder 기준 더 이상 지원 안 함, 기본 타깃은 NSIS. [fact-cited](https://github.com/electron-userland/electron-builder/issues/2157)
- Linux: `.deb`, `.rpm`, AppImage, snap 등 electron-builder가 폭넓게 지원(일반 통념, 이번 검색에서 직접 재확인은 안 했으나 electron-builder 공식 문서 범위로 잘 알려짐). [assumption: electron-builder Linux 타깃 목록은 이번 세션에서 재검색 안 함]
- Chromium을 통째로 번들하므로 배포판 시스템 라이브러리 버전에 덜 의존적(웹뷰 자체를 앱이 들고 다님) — 이는 Tauri의 WebKitGTK 버전 파편화 문제가 구조적으로 없다는 뜻. [assumption: 아키텍처상 당연 귀결, 별도 벤치마크 기사로 재확인은 안 함]

**Wails**
- Windows: NSIS 기반 인스톨러 생성 지원. Linux: AppImage 등 지원하나 커뮤니티 규모가 작아 Tauri 대비 배포 도구 성숙도가 낮음. [fact-cited: 정성적 평가](https://offline-pixel.github.io/compare/tauri-vs-wails-developer-hiring/)

## 2. 코드 서명

**공통 사실(Tauri/Electron/Wails 무관 — Windows 인증서 자체의 문제)**
- 2024년 정책 변경으로 EV 인증서의 "SmartScreen 즉시 통과" 특전이 사라짐. 현재는 EV든 OV든 동일하게 SmartScreen 평판 축적 과정(다운로드 수 누적)을 거쳐야 함. EV를 SmartScreen 우회 목적만으로 구매하는 것은 더 이상 정당화되지 않음(단, 커널모드 드라이버 서명은 여전히 EV 필수). [fact-cited](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)
- 비용: OV 인증서 연 $200~300, EV 인증서 연 $300~500대(업체별 프로모션가는 더 낮게도 나옴, 예: SSL.com EV $249~). [fact-cited](https://www.ssl.com/products/software-integrity/code-signing/ev/)
- 2026-03-01부터 CA/Browser Forum 신규 요건으로 코드서명 인증서 최대 유효기간이 458일로 제한(갱신 주기가 잦아짐 — SSL.com은 2026-02-27부터 458일 상한 적용 시작). [fact-cited](https://www.ssl.com/faqs/which-code-signing-certificate-do-i-need-ev-ov/)
- 결론: 1인 개발자 관점에서 OV 인증서(연 $200~300대)로 충분하며, 셸 선택(Tauri/Electron/Wails)이 이 비용 구조 자체를 바꾸지 않음 — 인증서는 셸과 무관한 별도 지출.

**Linux 코드 서명**: Linux 생태계는 Windows 같은 강제 서명·SmartScreen류 게이트가 없음(배포판 저장소 서명 체계는 있으나 개인 배포 바이너리에는 보통 강제 안 됨) — 세 후보 모두 실질적으로 대등. [assumption: Linux 코드서명 관행은 일반적으로 잘 알려진 사실이나 이번 세션 개별 재검색은 안 함]

## 3. 자동 업데이트 메커니즘과 무결성 검증

**Tauri v2**
- 공식 updater 플러그인 제공. **서명이 선택이 아니라 강제**: updater가 신뢰할 수 있는 소스임을 검증하기 위한 서명이 반드시 필요하며 이 요건은 끌 수 없음(`createUpdaterArtifacts` 설정 필요, public key는 `tauri.conf.json`에 명시, private key로 아티팩트 서명). [fact-cited](https://v2.tauri.app/plugin/updater/)
- Linux는 AppImage에 한해 업데이터 아티팩트(`.sig` 서명 파일)를 생성. [fact-cited](https://v2.tauri.app/plugin/updater/) → 즉 `.deb`/`.rpm`으로 배포하면 Tauri 자체 업데이터가 아니라 배포판 패키지 매니저(apt/dnf)나 별도 리포지토리 갱신 체계에 의존해야 함(구조적 트레이드오프).
- Windows 크로스컴파일 시 기본 서명 구현이 Windows 머신에서만 동작하므로, Linux/macOS에서 Windows 인스톨러를 크로스빌드하려면 커스텀 sign command가 필요. [fact-cited](https://v2.tauri.app/distribute/sign/windows/)

**Electron**
- electron-updater(electron-builder 생태계) 사용이 사실상 표준. NSIS 타깃에서 자동 업데이트 지원. **코드 서명은 자동 업데이트 동작의 필수조건은 아니지만 강력히 권장**되며, 서명 검증을 켜면 발행자명 기준으로 업데이트 서명을 확인 가능(선택적, Tauri처럼 강제는 아님). [fact-cited](https://github.com/electron-userland/electron-builder/issues/1189)
- 즉 Tauri는 "서명 강제"로 무결성이 기본값으로 보장되고, Electron은 "서명 권장이나 선택"이라 설정을 빠뜨리면 무결성 검증 없이 업데이트가 나갈 위험이 구조적으로 더 큼(운영자 실수 여지).

**Wails**: 자체 공식 자동 업데이트 플러그인이 Tauri만큼 표준화되어 있지 않음(커뮤니티 솔루션 의존 경향) — 성숙도 낮음. [assumption: 정성적 평가, 공식 업데이터 부재는 생태계 검색 결과 전반에서 일관되게 시사됨]

## 4. 바이너리 크기·메모리

여러 2026년 벤치마크 기사가 일관된 방향성을 보임(수치는 앱/측정 조건마다 편차가 있어 각 기사 자체 벤치마크임에 유의):
- 바이너리 크기: Tauri "Hello World" 기준 Electron 대비 약 96% 축소(3.2MB vs 85MB급 비교), 일반적으로 Tauri 2~15MB대, Electron 50~150MB 이상. [fact-cited](https://tech-insider.org/tauri-vs-electron-2026/)
- 메모리: Tauri idle 기준 약 42MB vs Electron 168MB(약 50% 이상 절감), 다른 기사는 Tauri 30~40MB vs Electron 100~409MB로 보고. [fact-cited](https://www.pkgpulse.com/guides/electron-vs-tauri-2026, https://rustify.rs/articles/rust-tauri-vs-electron-2026)
- 원인은 구조적: Electron은 앱마다 완전한 Chromium을 번들하지만 Tauri/Wails는 OS 네이티브 웹뷰를 재사용하므로 앱 자체가 담아야 할 무게가 훨씬 작음. [fact-cited](동일 출처)
- Wails도 네이티브 웹뷰 재사용 구조라 이 축에서는 Tauri와 유사한 이점을 가질 것으로 추정됨. [assumption: Wails 개별 수치 벤치마크는 이번 세션에서 직접 확인 안 함, 아키텍처 유사성에 근거한 추정]

## 5. 웹 프론트 코드 재사용성

- 셋 다 웹뷰 기반이라 기존 React+TypeScript 사이드패널 UI 자체(컴포넌트·상태관리·스타일)는 **거의 그대로 재사용 가능** — 이 축은 세 후보가 대등.
- 차이는 "렌더링 엔진 일관성": Electron은 전 OS에서 동일 Chromium 버전이라 CSS/JS 호환성 이슈가 거의 없음. Tauri/Wails는 OS별 웹뷰가 다름(Windows=Chromium 기반 WebView2, Linux=WebKitGTK, 즉 Safari 계열 엔진) → **WebKitGTK는 최신 CSS/JS 기능 지원이 Chromium보다 뒤처지는 경우가 있어 Linux 타깃에서 미묘한 렌더링 차이·폴리필 필요 가능성**이 구조적으로 존재. [assumption: WebKitGTK-Chromium 기능 격차는 일반적으로 알려진 사실이나 이번 세션에서 사이드탭 UI 구체 기능 대비 개별 검증은 안 함 — 실제 도입 전 사이드탭이 쓰는 최신 CSS(예: 컨테이너 쿼리, 특정 애니메이션 API) 호환을 Linux WebKitGTK 기준으로 별도 확인 필요]
- 프론트가 이미 "웹표준 API만 쓰는 core/shared + adapters" 포트-어댑터 구조라는 배경 제약과도 부합 — 데스크톱은 결국 하나의 어댑터(웹뷰 host)로 그친다는 점은 세 후보 공통.

## 6. 전역 단축키(특히 Linux Wayland)

이 축은 **세 프레임워크 공통의 구조적 한계**이며 특정 프레임워크의 구현 미비가 아님.
- Wayland는 보안 설계상 애플리케이션이 전역 키보드 단축키를 직접 잡는 것을 허용하지 않음 — 컴포지터가 모든 전역 키바인딩을 중재해야 함. [fact-cited](https://github.com/tauri-apps/tao/issues/331)
- Tauri의 global-shortcut 플러그인은 X11에서만 동작. Wayland 프로토콜 자체가 아직 이를 표준 정의하지 않았기 때문(`zwp_keyboard_shortcuts_inhibit_manager_v1` 미지원 컴포지터에서는 동작 안 함). 과거에는 Wayland에서 시도 시 libX11 세그폴트까지 발생해 현재는 Wayland에서 global-shortcut 스레드 자체를 비활성화한 상태. [fact-cited](https://github.com/tauri-apps/global-hotkey/issues/28, https://www.joyk.com/dig/detail/1648792502681651)
- Electron도 동일한 OS 레벨 제약을 받음 — `globalShortcut` API가 Linux Wayland에서 안정적으로 동작하지 않는 것은 Electron 이슈 트래커에서도 반복 보고되는 통념. [assumption: Electron 측 이번 세션 개별 재검색은 안 했으나, 근본 원인이 Wayland 프로토콜 부재이므로 어느 웹뷰 셸을 쓰든 동일하게 영향받음은 논리적으로 확실]
- 결론: 전역 단축키는 **셸 선택으로 해결되는 문제가 아니라 Linux 배포판·컴포지터 조합에 달린 문제**. X11(또는 XWayland 호환 컴포지터)에서는 세 후보 모두 동작 가능성이 있고, 순수 Wayland 네이티브 환경(GNOME/Wayland 등)에서는 세 후보 모두 제약을 받음. 제품 설계 시 "전역 단축키가 Linux에서 항상 보장되지 않는다"는 전제로 폴백(앱 내 단축키, 트레이 아이콘 클릭 등)을 반드시 마련해야 함.

## 7. 오프라인 로컬 캐시 저장

**Tauri**: 공식 플러그인 생태계가 이 요구사항에 바로 대응됨.
- `tauri-plugin-sql`: sqlx 기반 SQL 데이터베이스 연동(SQLite 포함) — "서버 정본의 로컬 캐시"를 그대로 SQLite로 구현 가능. [fact-cited](https://v2.tauri.app/plugin/)
- `tauri-plugin-store`: 영속 key-value 저장. `tauri-plugin-stronghold`: 암호화된 보안 저장(토큰·세션 등 민감정보에 적합). [fact-cited](https://v2.tauri.app/plugin/)
- Notification 플러그인으로 OS 알림도 공식 커버(요구사항의 "OS 알림" 항목과 직결), 모바일에서는 액션 버튼 포함 인터랙티브 알림까지 지원. [fact-cited](https://v2.tauri.app/plugin/notification/)

**Electron**: Node.js 생태계 전체를 그대로 쓸 수 있어(better-sqlite3, node-sqlite3 등) SQLite 연동은 오히려 더 성숙하고 선택지가 많음. OS 알림은 Electron 내장 `Notification` API로 커버. [assumption: Electron Node 생태계 성숙도는 통념, 이번 세션 개별 재검색 안 함]

**Wails**: Go 생태계의 SQLite 드라이버(`mattn/go-sqlite3` 등)를 그대로 사용 가능하나, Tauri처럼 "공식 플러그인" 형태로 패키징된 것은 아니라 직접 배선 필요. [assumption]

이 축은 셋 다 기술적으로 구현 가능(SQLite 자체가 언어 무관), 다만 Tauri는 "공식 플러그인 + 보안 스토리지(Stronghold)"까지 프레임워크 차원에서 제공한다는 점이 1인 유지보수 관점에서 배선 비용을 줄여줌.

## 8. 보안(크랙 저항 관점 — 전제: 신뢰 경계는 서버)

주의: 이 항목은 "클라이언트를 뚫어도 pro를 못 얻는다"는 서버 신뢰 경계 전제 하에서, 프론트엔드 소스 노출·조작 난이도만 비교하는 보조 지표임.

**Electron**
- 앱이 ASAR 아카이브(tar 유사 포맷)로 패키징되는데, **압축 해제가 매우 쉬움** — 별도 도구로 unpack하면 JS 소스가 거의 그대로 드러남. [fact-cited](https://noh.am/en/posts/unpacking-and-repacking-electron-apps/)
- 완화책: V8 바이트코드 컴파일 + ASAR 무결성 검증(빌드 시 해시와 런타임 대조로 변조 탐지) 조합이 상당한 방어선을 제공하나, "클라이언트 측 보호는 절대적이지 않다"는 것이 정설이며 서버 측 검증과 병행해야 함. [fact-cited](https://electron-vite.org/guide/source-code-protection.html)
- 즉 Electron은 **기본 상태에서는 소스가 그대로 노출**되고, 방어하려면 추가 빌드 파이프라인(바이트코드 컴파일러, 무결성 체크 플러그인)을 별도로 얹어야 함.

**Tauri**
- 프론트엔드(HTML/JS/CSS)는 결국 웹뷰에 로드되는 자산이라 원리상 완전 은닉은 불가능하나, **프로덕션 빌드 기본값으로 DevTools/인스펙터가 비활성화**되어 있어(개발/디버그 빌드에서만 활성, 프로덕션에 켜려면 Cargo feature를 명시적으로 켜야 함) 일반 사용자가 우클릭 검사로 소스를 바로 들여다보는 진입장벽이 Electron보다 기본값으로 더 높음. [fact-cited](https://v2.tauri.app/develop/debug/)
- 백엔드 로직이 Rust 네이티브 바이너리로 컴파일되므로, Node.js(사실상 인터프리트되는 JS, ASAR만 풀면 그대로 읽힘)보다 리버싱 난이도가 구조적으로 높음(디스어셈블 필요) — 단 이 프로젝트 배경상 "핵심 IP(파이프라인 프롬프트)는 서버 전용"이 이미 전제이므로, 클라이언트 바이너리 리버싱 난이도 차이가 실제 위협 모델에 미치는 영향은 제한적. [assumption: Rust 네이티브 vs JS 인터프리트 리버싱 난이도 차이는 일반적 소프트웨어 보안 통념, 이번 세션에서 정량 비교 자료는 검색 안 함]
- Tauri 팀은 스테이블 릴리스 전 dev-server 노출·IPC 하드닝·스코프 검증·리소스 식별자 관련 보안 감사를 수행하고 리포트를 공개함(Wails·Deno desktop은 이에 준하는 공개 감사가 없음). [fact-cited](https://tech-insider.org/tauri-vs-electron-2026/)

**결론(이 축)**: 신뢰 경계가 서버라는 전제 하에서는 어느 쪽이든 "pro 크랙 방지" 자체에는 실질적 영향이 없음(그건 서버가 담당). 다만 프론트 코드(UI 로직, UX 디테일)의 손쉬운 도용 저항력은 Tauri가 기본값 기준 약간 더 높음 — Electron은 동등 수준을 얻으려면 추가 설정(바이트코드 컴파일 + ASAR integrity)이 필요.

## 9. 생태계 성숙도·유지보수(1인 개발자 관점)

| 항목 | Tauri v2 | Electron | Wails v2 |
|---|---|---|---|
| 프로덕션 채택 사례 | ClickUp, Bitwarden 등 엔터프라이즈 채택 사례 존재 [fact-cited](https://offline-pixel.github.io/compare/tauri-vs-wails-developer-hiring/) | VS Code, Slack, Discord 등 압도적으로 많은 실전 사례(가장 오래되고 검증됨) [assumption: 통념] | 상대적으로 적음, 대규모 배포 사례 희소 [fact-cited](동일) |
| 릴리스 속도/버전 | 2026-07 기준 2.11.x 라인, 활발 [fact-cited](https://viadreams.cc/en/blog/tauri-guide/) | 매우 활발(가장 크고 오래된 생태계) [assumption] | 상대적으로 느림, 플러그인 생태계 작음 [fact-cited] |
| 언어 학습곡선(1인 개발자, 이미 TS 보유 전제) | Rust 신규 학습 필요(백엔드 로직을 Rust로 작성 시) | Node.js/TS만으로 완결 가능(가장 낮은 진입장벽) | Go 신규 학습 필요 |
| 모바일 확장성 | iOS/Android가 v2.0에서 stable API로 포함(단, "데스크톱은 프로덕션급으로 안정, 모바일은 아직 플러그인 지원·서명·웹뷰 특이사항에서 거친 부분 있음") — 제품 배경의 "향후 모바일 앱" 요구와 직결되는 유일한 후보 [fact-cited](https://v2.tauri.app/blog/tauri-mobile-alpha/, https://viadreams.cc/en/blog/tauri-guide/) | 모바일 없음(구조적으로 데스크톱/웹 전용) | 모바일 없음 |
| 커뮤니티 규모 | Electron보다 작지만 빠르게 성장, 플러그인 생태계 확장 중 [fact-cited] | 가장 큼, Stack Overflow·서드파티 라이브러리 압도적 [assumption] | 셋 중 가장 작음 [fact-cited] |

- 1인 유지보수 관점에서 핵심 트레이드오프: **Electron = 가장 낮은 학습곡선(순수 TS)과 가장 두꺼운 생태계 안전망**, 반대급부로 배포물 크기·메모리·기본 보안 하드닝을 직접 더 신경 써야 함. **Tauri = Rust 학습 비용은 있으나(단, 백엔드 로직 대부분을 얇게 유지하면 실사용 Rust 코드량 자체는 크지 않을 수 있음 [assumption]) 배포 크기·메모리·기본 보안·모바일 확장성에서 전반적으로 유리**. **Wails = 두 장점의 중간 지점을 노리지만 생태계·자동업데이트 성숙도가 가장 약함**, 이번 프로젝트처럼 장기 1인 유지보수 + 향후 모바일 확장 가능성이 있는 경우 우선순위에서 밀림.

## 10. 축별 평가 점수 (5점 만점, 높을수록 유리)

| 평가축 | Tauri v2 | Electron | Wails v2 |
|---|---|---|---|
| Windows/Linux 배포 형식 다양성 | 4 (deb/rpm/AppImage 공식, 단 AppImage 빌드 신뢰성 이슈) | 5 (electron-builder로 폭넓고 안정적) | 3 |
| 코드 서명 비용/용이성 | 4 (Windows 서명은 셋 공통 비용, Linux 크로스빌드 시 커스텀 sign command 필요) | 4 | 3 (도구 성숙도 낮음) |
| 자동 업데이트/무결성 | 5 (서명 강제, 기본값으로 안전) | 4 (서명 선택, 설정 누락 리스크) | 2 (공식 업데이터 미성숙) |
| 바이너리 크기/메모리 | 5 | 2 | 4~5 (아키텍처상 유사 추정, 실측 자료 부족) |
| 프론트 코드 재사용성 | 4 (재사용 가능하나 WebKitGTK 렌더링 차이 리스크) | 5 (Chromium 통일로 가장 예측 가능) | 4 |
| 전역 단축키(Linux Wayland) | 2 (X11 한정, 셋 공통 한계) | 2 (동일 OS 제약) | 2 (동일 OS 제약) |
| 오프라인 로컬 캐시 | 5 (공식 SQL/Store/Stronghold 플러그인) | 4 (Node 생태계로 가능, 공식 패키징은 아님) | 3 (직접 배선) |
| 보안(크랙 저항, 보조지표) | 4 (프로덕션 기본값 DevTools 차단 + 네이티브 바이너리) | 3 (기본 노출, 추가 설정 필요) | 3 (Tauri와 유사 구조 추정, 공개 감사 없음) |
| 생태계 성숙도/유지보수 | 4 | 5 | 2 |
| 모바일 확장성(제품 배경 요구사항) | 5 (유일하게 iOS/Android 로드맵 보유) | 1 (구조적으로 불가) | 1 (구조적으로 불가) |
| **합계(10축)** | **42** | **35** | **27** |

## 11. 추천

**Tauri v2를 추천.** 근거:
1. 이번 제품의 명시 요구사항인 "자동 업데이트(코드 서명·무결성 필수)"가 Tauri는 서명을 아예 끌 수 없는 강제 사항으로 걸려 있어 요구사항과 프레임워크 기본값이 정확히 맞아떨어짐. Electron은 동급 안전성을 얻으려면 운영자가 추가로 신경 써야 함.
2. "오프라인 열람(서버 정본의 로컬 캐시)" 요구사항에 SQL/Store/Stronghold 공식 플러그인이 바로 대응됨.
3. "향후 모바일 웹/앱" 요구사항에서 Tauri만 유일하게 동일 Rust 백엔드로 iOS/Android 확장 경로를 갖고 있음(Electron/Wails는 구조적으로 불가) — 이는 배경 문서의 "포트-어댑터, 이식 가능성" 하드 제약과도 정신이 맞닿음.
4. 바이너리 크기·메모리 이점은 사이드패널 상시 구동 앱 특성상(사용자가 데스크톱에서 장시간 띄워둘 가능성) 실사용 체감에 유리.
5. 1인 유지보수 리스크(Rust 학습곡선)는 실재하나, 이 프로젝트의 데스크톱 셸 레이어는 대부분 "웹뷰 host + 얇은 플러그인 배선"에 그칠 가능성이 높아(프론트는 이미 React/TS, 핵심 로직은 서버) 순수 Rust 애플리케이션 개발보다 학습 부담이 낮을 것으로 판단됨. [assumption: 실제 배선 범위는 buildflow 단계 설계에 따라 달라짐]

**단, 두 가지는 반드시 리스크로 명시**:
- Linux 배포 시 `.deb`/`.rpm`을 쓰면 Tauri 자체 자동 업데이터가 아니라 패키지 매니저/리포지토리 운영(apt repo 등)에 별도로 의존해야 함 — AppImage로 가면 업데이터는 되나 파일 크기가 커지고 빌드 신뢰성 이슈 보고가 있음. 배포 전략(어느 포맷을 1차로 할지) 결정 필요.
- 전역 단축키는 Linux Wayland 네이티브 환경에서 세 후보 모두 보장 안 됨 — "전역 단축키가 항상 동작한다"는 가정으로 설계하면 안 되고, 폴백 UX(트레이 아이콘·앱 내 단축키)를 처음부터 넣어야 함.

## 12. 기각 대안 및 사유

- **Electron**: 생태계·학습곡선 이점은 명확하나, (a) 배포 크기/메모리에서 구조적으로 불리, (b) 자동 업데이트 무결성이 "권장"에 그쳐 기본값 안전성이 낮음, (c) 모바일 확장 경로가 구조적으로 없어 "향후 모바일 앱" 요구사항과 정면으로 어긋남. 순수 데스크톱 전용·최대 생태계 안정성이 최우선이었다면 채택 여지가 있었으나, 이번 배경(모바일 확장, 1인 장기 유지보수, 로컬 캐시 요구)에서는 Tauri 대비 종합 점수 열위.
- **Wails**: Go 기반 IPC 설계는 우수하다는 평가가 있으나, 자동 업데이트·플러그인 생태계·공개 보안 감사 모두 Tauri 대비 성숙도가 낮고 모바일 확장 경로도 없음. 팀이 이미 Go 중심이었다면 고려할 만하나 현재 스택(TS/Node 계열)과의 친화도상 이점이 없음.

## 13. 확인 필요 사항 (buildflow 설계 단계로 이관)

- Linux 1차 배포 포맷을 `.deb`/`.rpm`(경량, 업데이터 별도 운영) vs AppImage(자체 업데이터, 용량 큼) 중 무엇으로 할지 — 사용자 페르소나(Cloud OP 지향이면 apt repo 직접 운영 경험도 포트폴리오 가치가 있을 수 있음, 단 이는 이 조사의 스코프 밖).
- 사이드탭 UI가 실제로 쓰는 CSS/JS 기능이 Linux WebKitGTK 4.1 기준으로 100% 호환되는지 실기기 검증(특히 애니메이션/오로라 이펙트, 배경 문서에 언급된 시각 효과들).
- Windows 코드서명 인증서는 셸 선택과 무관한 별도 구매 항목(OV, 연 $200~300대, 458일 유효기간 갱신 필요) — 예산/발급 주체를 별도로 정할 것.

## 14. 출처 목록

- https://v2.tauri.app/distribute/sign/windows/
- https://v2.tauri.app/plugin/updater/
- https://v2.tauri.app/distribute/debian/
- https://v2.tauri.app/distribute/rpm/
- https://v2.tauri.app/distribute/appimage/
- https://github.com/orgs/tauri-apps/discussions/10026
- https://ostechnix.com/tauri-framework-build-and-package-lightweight-applications/
- https://github.com/tauri-apps/tauri/issues/14796
- https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation
- https://www.ssl.com/products/software-integrity/code-signing/ev/
- https://www.ssl.com/faqs/which-code-signing-certificate-do-i-need-ev-ov/
- https://github.com/electron-userland/electron-builder/issues/1189
- https://github.com/electron-userland/electron-builder/issues/2157
- https://tech-insider.org/tauri-vs-electron-2026/
- https://www.pkgpulse.com/guides/electron-vs-tauri-2026
- https://rustify.rs/articles/rust-tauri-vs-electron-2026
- https://github.com/tauri-apps/tao/issues/331
- https://github.com/tauri-apps/global-hotkey/issues/28
- https://www.joyk.com/dig/detail/1648792502681651
- https://v2.tauri.app/plugin/
- https://v2.tauri.app/plugin/notification/
- https://noh.am/en/posts/unpacking-and-repacking-electron-apps/
- https://electron-vite.org/guide/source-code-protection.html
- https://v2.tauri.app/develop/debug/
- https://offline-pixel.github.io/compare/tauri-vs-wails-developer-hiring/
- https://viadreams.cc/en/blog/tauri-guide/
- https://v2.tauri.app/blog/tauri-mobile-alpha/

## 검증 정정

독립 재검증자(적대 검증) 주석. 원문은 그대로 두고 아래에 정정·보강만 추가함. 핵심 사실 주장 10건 이상을 WebSearch로 재검증했고, 누락 대안 1회 탐색을 수행함.

### 재검증 결과: 원문 그대로 확인됨 (오류 없음)

1. **Tauri updater 서명 강제** — 확인됨. "This cannot be disabled"라는 표현이 커뮤니티 문서에서도 재확인됨. [fact-cited](https://v2.tauri.app/plugin/updater/, https://docs.rs/tauri-plugin-updater)
2. **Tauri 현재 버전 2.11.x (2026-07 기준)** — 확인됨. 2.11.5가 2026-07-01 릴리스. [fact-cited](https://docs.rs/crate/tauri/latest) (단, 검색 중 한 블로그(rustify.rs)는 "현재 라인 2.9.x, 2.9.6=2025-12-09"라고 적어 docs.rs와 모순 — docs.rs가 1차 출처이므로 그쪽을 신뢰. 2차 출처 블로그 수치는 낮은 신뢰로 취급할 것.)
3. **Tauri v2 모바일이 iOS/Android stable API(v2.0.0)** — 확인됨. 단 "stable API"이지만 플러그인/서명/웹뷰 특이사항에서 거친 부분이 있다는 원문의 단서도 재확인됨. [fact-cited](https://viadreams.cc/en/blog/tauri-guide/)
4. **AppImage ~76MB vs deb/rpm ~4MB** — 정확히 일치하는 수치를 원출처 그대로 재확인함. [fact-cited](동일 tech-insider 계열 출처)
5. **Tauri global-shortcut은 X11 전용, Wayland 비활성화** — 확인됨. 추가로 구체 원인 확인: `zwp_keyboard_shortcuts_inhibit_manager_v1` 프로토콜을 미지원하는 컴포지터(COSMIC, Sway, Hyprland 등 wlroots 계열 대부분)에서 동작 안 함. [fact-cited](https://github.com/cjpais/Handy/issues/949)
6. **Electron ASAR는 기본적으로 미암호화, 손쉽게 unpack 가능** — 확인됨(복수 독립 출처). [fact-cited](https://medium.com/@libaration/decompiling-and-repacking-electron-apps-b9bfbc8390d5, https://noh.am/en/posts/unpacking-and-repacking-electron-apps/)
7. **electron-builder Squirrel.Windows deprecated, NSIS가 기본 타깃** — 확인됨(공식 electron-builder 문서). [fact-cited](https://www.electron.build/docs/squirrel-windows/, https://www.electron.build/docs/nsis/)
8. **EV 인증서 2024년 SmartScreen 즉시신뢰 특전 소멸** — 확인됨. 시점까지 구체화: 2024-03 정책변경, 2024-08 초 기존 루트에서 EV Code Signing OID 제거. [fact-cited](https://www.todesktop.com/blog/posts/windows-apps-psa-ev-certs-do-not-grant-immediate-reputation-anymore)
9. **코드서명 인증서 유효기간 단축(2026-03-01 기점)** — 방향과 시점은 확인됨. 다만 정확한 일수는 출처마다 458/459/460일로 갈림(CA/B Forum Ballot CSC-31, 2025-11-17 채택; SSL.com=458일, DigiCert=459일, 다수 매체=460일 표기). 원문이 인용한 458일(SSL.com)은 유효한 출처이나 "표준 수치"로 단정하기보다 "약 15개월(458~460일, CA마다 표기 편차)"로 낮은 신뢰로 재표기 권장. 결론(비용구조·셸 무관)에는 영향 없음.
10. **ClickUp·Bitwarden의 Tauri 프로덕션 채택** — 원문은 offline-pixel.github.io(개인 블로그) 단일 출처였는데, 독립 검색으로도 동일 주장이 복수 2차 출처에서 반복 확인됨. 다만 1차 출처(ClickUp/Bitwarden 공식 기술 블로그)까지는 확인 못 함 — 중간 신뢰로 유지.

### 정정 필요: 원문 주장 중 부정확하거나 시점이 지난 것

**[중요, 추천 논거에 영향] Wails의 "모바일 확장 불가"는 더 이상 사실이 아님.** 원문은 §9 표와 §11 추천 근거 3번, §12 기각사유에서 "Wails=모바일 없음, 구조적으로 불가"를 Tauri 차별화 근거로 명시했으나, **Wails v3(현재 alpha)는 실제로 iOS/Android 모바일 지원을 갖추고 있음** — 동일 main.go/프론트엔드가 데스크톱과 모바일에 컴파일되며, 바인딩·이벤트·다이얼로그·햅틱·위치·생체인증·알림·보안저장까지 지원 범위가 넓음. [fact-cited](https://v3.wails.io/guides/mobile/, https://v3.wails.io/guides/mobile/first-mobile-app/) 단, Wails v3 자체가 전체적으로 alpha 단계(API는 "reasonably stable"이나 베타 전 단계)라 Tauri의 "2년 실전 검증된 stable v2.0 모바일 API"에 비해 성숙도는 명백히 낮음. **정정 방향: "Wails는 모바일이 구조적으로 불가능"이 아니라 "Wails도 모바일 경로가 있으나 Tauri보다 훨씬 이른 단계(alpha)"로 수정.** 이는 §10 점수표의 Wails 모바일 확장성 항목(1점)이 과소평가됐음을 뜻하나, alpha 단계 격차를 고려하면 추천 결론(Tauri 우위)이 뒤집히진 않음 — 다만 "Tauri만 유일하게 모바일 경로를 가진다"는 표현은 부정확하므로 "Tauri는 안정화된 모바일 경로, Wails는 이제 막 시작된 alpha 경로"로 완화 필요.

**[중간 영향] Wails의 "공식 자동 업데이트 미성숙"도 최신 상황과 다소 어긋남.** 원문 §3·§10은 Wails를 "공식 업데이터 부재/미성숙"으로 평가했으나, **Wails v3(alpha)는 자동 업데이트 확인·다운로드·설치를 지원하는 내장 업데이터를 공식 제공**하며 bsdiff 기반 델타 업데이트(패치 다운로드 최소화)까지 갖춤. [fact-cited](https://v3alpha.wails.io/guides/distribution/auto-updates/) 다만 이 역시 v3 alpha 범위라 Tauri의 서명강제형 stable 업데이터만큼 검증되진 않음. §10 Wails 자동업데이트 점수(2점)는 다소 낮게 매겨졌을 가능성 있음(3점 정도가 더 근접) — 그러나 이 축이 총점(10축 합계)을 뒤집을 정도는 아님.

**[경미, 장기 리스크로 추가할 사항] Tauri의 Stronghold 플러그인은 장기적으로 사라질 예정.** 원문 §7·§10은 "tauri-plugin-stronghold(암호화 보안 저장)"를 Tauri의 안정적 강점으로 서술했으나, 공식 문서에 **"stronghold is no longer recommended and will be deprecated and removed in v3"**라는 문구가 있음. [fact-cited](https://docs.rs/crate/tauri-plugin-stronghold/latest) 다만 Tauri v3는 아직 로드맵 확정 전(2026-05 기준 마일스톤만 개설, 확정 일정 없음 — 주로 GTK3/gtk-rs 노후화 대응 목적)이라 당장의 실무 리스크는 낮음. [fact-cited](https://github.com/tauri-apps/tauri/milestone/5) **buildflow 단계에서 "민감정보 저장을 Stronghold에 고정 배선하지 말고 대체 경로(OS 키체인 연동 등)도 열어둘 것"을 리스크로 추가 권고.**

### 누락 대안 탐색 (1회)

**Neutralino.js**를 웹뷰 기반 데스크톱 셸의 네 번째 후보로 발견함 — 바이너리 2~5MB로 세 후보보다도 가볍고, JS/HTML/CSS로 완결. [fact-cited](https://www.pkgpulse.com/guides/best-desktop-app-frameworks-2026) 다만 SQLite 연동이 공식 플러그인이 아니라 프로세스 스폰(spawn) 방식의 우회 배선이 필요하고, 공식 모바일 경로·공식 서명강제 업데이터·공개 보안감사 등 이번 프로젝트 요구축(§7, §3, §8) 대비 성숙도가 세 후보보다 낮아 "소형 유틸/트레이 도구"에 권장되는 수준(2026 벤치마크 다수 일치). **결론: Neutralino 누락은 이번 요구사항(오프라인 SQL 캐시 공식 플러그인, 모바일 확장, 서명강제 업데이터) 기준으로는 정당한 배제이나, 원문에 "왜 후보에서 뺐는지" 명시적 서술이 없었던 점은 문서 완결성 흠으로 지적.** Flutter/.NET MAUI/Qt 등은 웹뷰가 아닌 네이티브 렌더링이라 "기존 React/TS UI 재사용" 하드 제약과 정면 배치되므로 원문의 암묵적 배제는 타당함(별도 정정 불요).

### 판정

**추천(Tauri v2) 유지.** 정정 사항 중 가장 영향력 있는 것(Wails 모바일·업데이터가 원문 서술보다 덜 열세)도 "격차 축소"이지 "우위 역전"이 아님 — Wails v3 자체가 alpha라는 성숙도 격차가 여전히 커서 "1인 장기 유지보수 + 안정성 우선" 결론을 뒤집지 못함. 다만 원문의 "Tauri만 유일하게 모바일 경로 보유"라는 강한 차별화 문구와 "Wails=업데이트 미성숙" 단정은 과장이었으므로 완화 표현으로 수정 권고. 코드서명 유효기간 458일 표기는 출처 간 458~460일 편차가 있어 낮은 신뢰로 하향 조정 권고(결론 무관). Stronghold 장기 지속가능성은 신규 리스크로 buildflow 단계에 추가 권고.

### 검증 세션 추가 출처

- https://docs.rs/tauri-plugin-updater
- https://docs.rs/crate/tauri/latest
- https://github.com/cjpais/Handy/issues/949
- https://medium.com/@libaration/decompiling-and-repacking-electron-apps-b9bfbc8390d5
- https://www.electron.build/docs/squirrel-windows/
- https://www.electron.build/docs/nsis/
- https://www.todesktop.com/blog/posts/windows-apps-psa-ev-certs-do-not-grant-immediate-reputation-anymore
- https://securityboulevard.com/2026/02/code-signing-certificate-validity-changes-now-in-effect-from-february-2026/
- https://v3.wails.io/guides/mobile/
- https://v3.wails.io/guides/mobile/first-mobile-app/
- https://v3alpha.wails.io/guides/distribution/auto-updates/
- https://docs.rs/crate/tauri-plugin-stronghold/latest
- https://github.com/tauri-apps/tauri/milestone/5
- https://www.pkgpulse.com/guides/best-desktop-app-frameworks-2026
