# 배경노트 v2 UI/UX 인덱스

| 항목 | 내용 |
|---|---|
| 문서 상태 | **v1.0 (2026-08-17)** — 탐색 6대 실측 + 비판 6대 대조 완료 |
| 목적 | 화면에 무엇이 이미 있는지를 코드를 열지 않고 답한다 |
| 방법 | 6개 구역을 병렬 실측한 뒤 같은 구역을 다른 여섯 대가 원문 대조. 모든 행이 `파일:행`을 갖는다 |
| 범위 | 표면 15 · 요소 행 171 · 슬롯 6 · 불변식 26 · 드리프트 13(D-1·D-13 해소) |
| 코드 기준 | 커밋 `d9fe383` 시점 |
| 절 구성 | §0 사용법 · §1 화면 목록 · §2 요소 표 · §3 슬롯 · §4 불변식 · §5 반응형 · §6 상태 관례 · §7 접근성 · §8 문구 · §9 토큰 · §10 드리프트 · §11 C5-S3 직결 · §12 유지 |
| 비판 라운드 결과 | 서술 오류 3, 행 번호 오류 17, 누락 행 9, 신규 드리프트 4를 잡아 반영했다. 접근성 전수(§7)·문구 표(§8)·반응형(§5)은 불일치 0건으로 통과 |

## 0. 왜 이 문서가 있는가

설계가 같은 자리에서 반복해서 막혔다. 화면에 무엇이 있는지를 그때그때 코드를 파서 알아냈고, 그 과정에서 판단이 여러 번 뒤집혔다. C5-S3 설계 중 비판 패널 6대를 두 라운드 돌린 결과, 발견의 상당수가 결함이 아니라 **이미 있는 것을 몰라서 생긴 오해**였다. 실제로 뒤집힌 것 넷.

- "진입 화면 상단에는 아무것도 못 얹는다" → 조건부 요소가 이미 거기 있었다
- "이 코드베이스에 접근성 관례가 없다" → `aria-label`만 13곳이었다
- "담은 어휘 화면을 새로 만들어야 한다" → `Journey`에 `kept`가 이미 있었다
- "확장 슬롯을 설계해야 한다" → `PrimerScreen`의 `mapPanel`이 이미 관례였다

넷 다 인덱스가 있었으면 30초에 끝났다.

### 쓰는 법

| 묻고 싶은 것 | 볼 곳 |
|---|---|
| 이 화면에 무엇이 있나, 무슨 조건에 뜨나 | §2 |
| 여기에 새 요소를 꽂아도 되나 | §3 슬롯, §4 불변식 |
| 이 자리에 두면 무엇이 밀리나 | §4 |
| 폭이 바뀌면 무엇이 달라지나 | §5 |
| 로딩·빈·실패·오프라인을 이 제품은 어떻게 그리나 | §6 |
| 이 상호작용에 무슨 속성을 붙여야 하나 | §7 |
| 새 문구를 어떻게 4개 언어에 올리나 | §8 |
| 무슨 토큰을 써도 되나 | §9 |
| 이거 살아 있는 코드 맞나 | §10 |

### 규율

- **CSS를 절대 행 번호로 지목하지 않는다.** 선택자 이름으로 지목한다. `vars.css` 분리 때 24행이 밀려 기존 참조가 전부 어긋난 전례가 있다(`_shadow/.../vars.css.md`). 이 문서의 CSS 참조도 선택자 우선이고 행 번호는 보조다.
- TSX·TS는 행 번호를 쓴다. 다만 이 문서는 커밋 `d9fe383` 기준이므로 어긋나면 문서가 아니라 코드가 정본이다.
- "없음"은 내용이다. 빈칸으로 두지 않는다.

---

## 1. 화면 목록

`Journey` 판별 유니온(`app/journey-state.ts:8-15`)이 화면의 정본이다. 라우터는 없고 `journey.tsx`의 조건부 렌더가 전부다.

| `at` | 화면 | 파일 | 렌더 지점 |
|---|---|---|---|
| `entry` | 진입 | `screens/EntryScreen.tsx` | `journey.tsx:229` |
| `narrow` | 좁히기 | `screens/narrow/NarrowScreen.tsx` | `journey.tsx:238` |
| `difficulty` | 난이도 선택 | `screens/difficulty/DifficultyScreen.tsx` | `journey.tsx:240` |
| `terms` | 어휘 목록 | `screens/terms/TermsScreen.tsx` | `journey.tsx:244` |
| `kept` | 담은 어휘 | `screens/kept/KeptScreen.tsx` | `journey.tsx:258` |
| `primer` | 종착(프라이머) | `screens/primer/PrimerScreen.tsx` | `journey.tsx:268` |
| `refusal` | 고위험 거부 | `screens/RefusalScreen.tsx` | `journey.tsx:292` |

라우팅되지 않는 표면 8개. 셸(`AppShell`), 사이드바 세션 목록(`SessionList`), 프로젝트 목록(`ProjectList`), 로그인 위젯(`AuthButton`), 카드 상세(`TermDetail`), 출처 패널(`SourcePanel`), 편집 시트(`EditSheet`), 랜딩(별도 Astro 앱).

`journey-state.ts`의 `primer` 항목에 붙은 주석이 이 화면의 성격을 정한다.

> 세션의 종착(C5-S2). 되돌아가는 문이 아니라 나가는 문이다

---

## 2. 화면별 요소

### 2-1. 셸 — `app/AppShell.tsx` (81행)

**들어오는 경로:** 라우팅 없음. `journey.tsx:221`에서 항상 최상위로 마운트되고 모든 여정 화면이 `children`으로 들어간다.
**나가는 경로:** 사이드바 세션 클릭 → `onOpenSession`(=`resume`, `journey.tsx:214`). 토글·스크림은 화면 전환이 아니라 `drawerOpen` 상태만 바꾼다.

| # | 요소 | 클래스 | 표시 조건 | 문구 키 | 파일:행 |
|---|---|---|---|---|---|
| 0 | 최상위 그리드 | `.appRoot` | 항상 | — | `AppShell.tsx:45` |
| 1 | 사이드바 컨테이너 | `.sidebar`(`.open` 토글) | 항상 DOM. `open`은 `drawerOpen`일 때 | — | `AppShell.tsx:46` |
| 2 | 사이드바 머리 | `.sbHead` | 항상 | — | `AppShell.tsx:47` |
| 2b | 브랜드 래퍼 | `.brand` | 항상. `Brand()`가 `.sbHead`와 `.hdrBrand` **두 곳에서 호출된다** | — | `AppShell.tsx:20` |
| 3 | 로고 장식 | `.logo` | 항상, `aria-hidden` | — | `AppShell.tsx:21` |
| 4 | 브랜드명 | `.brand b` | 항상 | `tr("brand")` | `AppShell.tsx:23` |
| 5 | 브랜드 부제 | `.brand span` | 항상 (숨김 규칙이 안 걸림 — §10 참조) | `tr("brand_sub")` | `AppShell.tsx:24` |
| 6 | 본문 스크롤 영역 | `.sbBody.scroll` | 항상 | — | `AppShell.tsx:50` |
| 7 | 이전 탐색 라벨 | `.sbSection` | 항상 | `tr("nav_sessions")` | `AppShell.tsx:51` |
| 8 | 세션 목록 슬롯 | 주입 | `sessions` prop | — | `AppShell.tsx:52` |
| 9 | ㄴ 미주입 시 대체 문구 | `.sbEmpty` | `sessions`가 `undefined` | `tr("sessions_empty")` | `AppShell.tsx:52` |
| 10 | 프로젝트 라벨 | `.sbSection` | 항상 | `tr("nav_projects")` | `AppShell.tsx:53` |
| 11 | 프로젝트 목록 슬롯 | 주입 | `projects` prop | — | `AppShell.tsx:54` |
| 12 | ㄴ 미주입 시 대체 문구 | `.sbEmpty` | `projects`가 `undefined` | `tr("projects_empty")` | `AppShell.tsx:54` |
| 13 | 사이드바 하단 슬롯 | `.sbFoot` | `footer`가 truthy | — | `AppShell.tsx:56` |
| 14 | 스크림 | `.scrim` | `drawerOpen` | — | `AppShell.tsx:59` |
| 15 | 본문 열 | `.mainCol` | 항상 | — | `AppShell.tsx:61` |
| 16 | 앱 컨테이너 | `#app` | 항상 | — | `AppShell.tsx:62` |
| 17 | 헤더 바 | `header` | 항상 | — | `AppShell.tsx:63` |
| 18 | 사이드바 여는 버튼 | `.iconbtn.sbToggle` | 항상 DOM. ≥64em에서 CSS 숨김 | `tr("menu")` | `AppShell.tsx:64` |
| 18b | ㄴ 메뉴 아이콘 | `svg` | 항상, `aria-hidden` | — | `AppShell.tsx:11` |
| 19 | 헤더 브랜드 | `.hdrBrand` | 항상 DOM. ≥64em에서 CSS 숨김 | — | `AppShell.tsx:67` |
| 20 | 헤더 도구 묶음 | `.htools` | 항상 | — | `AppShell.tsx:72` |
| 21 | 언어 선택 | `.langsel` | 항상 | `tr("lang_label")` | `LangSelect.tsx:11-22` |
| 22 | 여정 화면 본문 | `{children}` | 항상 | — | `AppShell.tsx:76` |

**상태 처리:** 셸 자체는 로딩·실패·오프라인을 그리지 않는다. 목록의 실제 빈 상태는 셸이 모르고 주입된 컴포넌트가 안다.
**접근성:** `aria-hidden` 2(메뉴 아이콘, 로고), `aria-label`+`title` 1(사이드바 열기).

### 2-2. 세션 목록 — `app/SessionList.tsx` (110행)

| # | 요소 | 클래스 | 표시 조건 | 문구 키 | 파일:행 |
|---|---|---|---|---|---|
| 1 | 비로그인 안내(조기 반환) | `.sbEmpty` | `off` — 이 한 줄만 그리고 return | `tr("sessions_off")` | `SessionList.tsx:43` |
| 2 | 오프라인 폴백 고지 | `.sbEmpty` | `notice` truthy | 상위가 문자열로 전달 | `SessionList.tsx:47` |
| 3 | 검색창 | `.sbSearch` | `items.length>0 \|\| query` | `tr("sessions_search_ph")` | `SessionList.tsx:48` |
| 4 | 빈 목록 안내 | `.sbEmpty` | `items.length===0 && !loading` | `tr("sessions_empty")` | `SessionList.tsx:58` |
| 5 | 목록 컨테이너 | `.history` | 항상 | — | `SessionList.tsx:60` |
| 6 | 항목 | `.histitem` | 각 원소 | — | `SessionList.tsx:62` |
| 7 | ㄴ 본문 버튼 | `.histmain`>`.histtopic`/`.histmeta` | 항상 | `session_untitled` / `session_generating` / `area` | `SessionList.tsx:63-66` |
| 8 | ㄴ 삭제 버튼 | `.histdel` | 항상 | `tr("session_delete")` | `SessionList.tsx:67` |
| 9 | 더 보기 | `.link` | `hasMore` | `sessions_more` / `sessions_loading` | `SessionList.tsx:82` |
| 10 | 삭제 취소 안내 | `.sbEmpty` | `undo` 존재 | `session_deleted` / `session_undo_expired` | `SessionList.tsx:88` |
| 11 | ㄴ 실행취소 링크 | `.link` | `undo.expired === false` | `tr("session_undo")` | `SessionList.tsx:95` |

**상태 처리:** 초기 로딩 구간(`loading && items.length===0`)은 빈 목록 안내가 `!loading` 조건으로 억제되어 **아무것도 안 그린다.** 실패 상태는 prop 자체가 없다.
**불변식:** 세 축이 다르다는 것이 주석에 명시(`SessionList.tsx:10-14`) — 비로그인(`off`)·오프라인 고지(`notice`)·빈 목록은 서로 다른 뜻이다. 클래스는 v1의 `.hist*`를 쓰고 새로 만들지 않는다.

### 2-3. 프로젝트 목록 — `app/ProjectList.tsx` (66행)

| # | 요소 | 클래스 | 표시 조건 | 문구 키 | 파일:행 |
|---|---|---|---|---|---|
| 1 | 비로그인 안내(조기 반환) | `.sbEmpty` | `off` | `tr("projects_off")` | `ProjectList.tsx:22` |
| 2 | 빈 목록 안내 | `.sbEmpty` | `items.length===0` | `tr("projects_empty")` | `ProjectList.tsx:33` |
| 3 | 목록 컨테이너 | `.plist` | 항상. C5-S3 이전에는 `.drawerWrap` 이었다 — §10 D-1 | — | `ProjectList.tsx:38` |
| 4 | 항목 | `.drawerItem`(`.sel`) | 각 원소 | — | `ProjectList.tsx:37` |
| 5 | ㄴ 선택 버튼 | `.histmain` | 항상. 같은 것 재클릭 시 선택 해제 | `p.name`(사용자 데이터) | `ProjectList.tsx:39` |
| 6 | ㄴ 삭제 버튼 | `.histdel` | 항상 | `project_delete` / `project_delete_hint` | `ProjectList.tsx:42` |
| 7 | 새 프로젝트 입력 | `.sbSearch` | 항상 | `tr("project_new_ph")` | `ProjectList.tsx:54` |

**나가는 경로:** 없음. 선택은 세션 목록의 범위와 새 탐색의 배속만 바꾼다(S-15).
**주의:** `off`가 세션 쪽 값(`sync.list.off`)을 그대로 재사용한다(`sidebar-slots.tsx:37`). 프로젝트 독립 off 상태는 없다.

### 2-4. 진입 — `screens/EntryScreen.tsx` (227행)

**들어오는 경로:** 앱 최초 상태(`journey.tsx:51`) · 주간 소진 복귀(`journey.tsx:61`) · 홈 복귀(`journey.tsx:205-209`, 호출부는 `KeptScreen`·`PrimerScreen`).
**나가는 경로:** `onSubmit` 하나뿐(`EntryScreen.tsx:102-110` → `journey.tsx:167-173` → `at:"narrow"`). 촉발은 전송 버튼과 Shift 없는 Enter 둘.

| # | 요소 | 클래스 | 표시 조건 | 문구 키 | 파일:행 |
|---|---|---|---|---|---|
| 0 | **화면 전체 드롭존** | `main.entryMain` | 항상. `onDragOver`·`onDrop`으로 파일 첨부(FR-901·DS4-5). 보이는 요소는 아니지만 상시 작동한다 | — | `EntryScreen.tsx:120-130` |
| 1 | 복귀 사유 안내 | `.listnote` | `notice` truthy | 상위가 문자열 전달 | `EntryScreen.tsx:132` |
| 2 | 히어로 | `.hero` | 항상 | — | `EntryScreen.tsx:136` |
| 3 | 제목·부제 고정영역 | `.heroHead` | 항상 | — | `EntryScreen.tsx:137` |
| 4 | 제목 | `.heroTitle` | 항상 | `tr("entry_title")` | `EntryScreen.tsx:138` |
| 5 | 부제 | `.heroSub` | 항상 | `tr("entry_sub")` | `EntryScreen.tsx:139` |
| 6 | 오로라 래퍼 | `.heroGlow` | 항상 | — | `EntryScreen.tsx:141` |
| 7 | 오로라 | `.aurora` | 항상, `aria-hidden` | — | `EntryScreen.tsx:142` |
| 8 | 입력 박스 | `.composer`(`.err`) | 항상 | — | `EntryScreen.tsx:143` |
| 9 | 입력창 | `.composerInput` | 항상 | `entry_input_aria` / `entry_input_ph` | `EntryScreen.tsx:144` |
| 10 | 하단 바 | `.composerBar` | 항상 | — | `EntryScreen.tsx:163` |
| 11 | 조건 토글 | `.condToggle` | 항상 | `cond_close` / `cond_add` | `EntryScreen.tsx:164` |
| 12 | 첨부 제거 | `.attach` | `attached` truthy | `attach_remove`(title) | `EntryScreen.tsx:168` |
| 13 | 첨부 추가 | `.attach`(`.locked`) | `attached` falsy | `attach` / `attach_short` | `EntryScreen.tsx:172` |
| 14 | 숨은 파일 입력 | `input[type=file]` | 항상 DOM, 비표시 | — | `EntryScreen.tsx:181` |
| 15 | 전송 | `.send` | 항상 | `tr("next")` | `EntryScreen.tsx:192` |
| 16 | 입력 오류 | `.errmsg` | `inputErr` | `tr("entry_err")` | `EntryScreen.tsx:197` |
| 17 | 첨부 고지 | `.listnote` | `attachNote` truthy | `tr(attachNote)` | `EntryScreen.tsx:198` |
| 18 | 조건 입력 | `.field.condField` | `showCond` | `cond_aria` / `cond_ph` | `EntryScreen.tsx:199` |
| 19 | 칩 묶음 | `.suggest` | 항상 | — | `EntryScreen.tsx:208` |
| 20 | 예시 칩 ×8 | `.sg` | 항상(고정 8) | 동적 문자열, tr 아님 | `EntryScreen.tsx:209` |
| 21 | 다시 뽑기 | `.shuffle` | 항상 | `tr("shuffle")` | `EntryScreen.tsx:219` |

**상태 처리:** 넷 다 안 그린다. 이 화면은 목록도 비동기 조회도 갖지 않는다.

**빈자리 세 곳 — 다음 슬라이스가 알아야 할 사실**

| 자리 | 현재 내용 |
|---|---|
| `.hero` **위** | 조건부 `notice` 한 줄뿐. 그 외 아무것도 놓인 적 없다 |
| 입력창과 칩 **사이** | 조건부 셋(`errmsg`·`attachNote`·`condField`). 셋 다 꺼지면 완전히 빈다 |
| 칩 **아래** | **아무것도 렌더되지 않는다.** 단 `.suggest`는 `<main>`의 마지막 자식이 아니다 — 아래 중첩 구조를 볼 것 |

**중첩 구조를 착각하면 안 된다.** 실제는 3단이다.

```
main.entryMain
└ .hero                    (flex:1 — 남는 세로 공간을 전부 가져간다)
  ├ .heroHead              (고정 높이. 제목·부제만 들어 있다)
  └ .heroGlow              (block. 자식 간격은 margin-top 관례)
    ├ .aurora              (absolute, bottom:0 — heroGlow 바닥 기준)
    ├ .composer … .condField
    └ .suggest             ← 칩. 이 뒤로 아무것도 없다
```

`.suggest` 다음에 닫히는 것은 `.heroGlow` → `.hero` → `main` 셋이다. **`<main>`에 형제로 붙이면 된다고 읽으면 안 된다.**

칩 아래가 비어 있는 것은 우연이 아니다. `.heroHead` 주석이 "앞으로 붙을 기능이 그 공간으로 흘러내린다"고 자리를 지정해뒀고, 오로라 주석이 그 구역을 배경 처리에서 뺀다.

> 진입 오로라 하이라이트. 입력창부터 예시칩까지 감싸는 영역(제목과 부제 위, **하단 history 제외**).

**다만 이 제외는 보장이 아니라 조건이다.** `.aurora`의 `bottom:0`은 `.heroGlow` 바닥 기준이고, 그 바닥은 지금 `.suggest`가 정한다. 새 요소를 `.heroGlow` **안**에 넣으면 오로라가 그 요소까지 따라와 덮는다. 제외를 실제로 지키려면 `.heroGlow` **바깥**에 둬야 한다.

### 2-5. 좁히기 — `screens/narrow/` (모듈 756행)

상태 기계 구동이라 표시 조건이 상태명이다. `NarrowState`가 가질 수 있는 값(`narrow/types.ts:46-56`).

| 상태 | 의미 | 렌더 |
|---|---|---|
| `idle` | 시작 전·`leave` 이후 | `null` |
| `classifying` | 분류 호출 중 | 대기 화면 |
| `asking` | 답하는 중 | 본문 전체 |
| `relating` | 연결 턴 조회 중 | 대기 화면 |
| `advancing` | 다음 질문 계산 중 | 대기 화면 |
| `failed` | 실패, 제자리 재시도 | 실패 화면 |
| `done` | 종료, handoff 중 | `null` |

`asking` 안의 연결 턴은 별도 상태가 아니라 `connect` 플래그다. 이유가 주석에 있다 — "선택·직접입력 처리가 똑같아서 복제하면 두 벌이 된다"(`types.ts:50`). 그래서 **요소 12·13·14**는 상태명만으로 조건이 안 잡히고 `connect` 유무를 함께 봐야 한다. 요소 15(다음 버튼)는 `asking`이면 무조건 렌더되고 `disabled`도 `canConfirm`에서만 오므로 `connect`와 무관하다.

| # | 요소 | 클래스 | 표시 조건 | 문구 키 | 파일:행 |
|---|---|---|---|---|---|
| 1 | 대기 안내 | `.lead` | `classifying`\|`advancing`\|`relating` | `tr("thinking")` | `NarrowScreen.tsx:22` |
| 2 | 실패 안내 | `.errmsg` | `failed` | `tr(errorKey(...))` | `NarrowScreen.tsx:30` |
| 3 | 재시도 | `.btn.btn-primary` | `failed && isRetryable` | `tr("retry")` | `NarrowScreen.tsx:37` |
| 4 | 진행 안내 | `.rangehint` | `asking` | `narrow_ai` + `narrow_budget` | `NarrowScreen.tsx:58` |
| 5 | 쉬운 모드 안내 | `.subhint` | `asking && ctx.simplify` | `tr("narrow_simplified")` | `NarrowScreen.tsx:62` |
| 6 | 질문 | `h2` | `asking` | 서버 원문 | `NarrowScreen.tsx:64` |
| 7 | 리드 | `.lead` | `asking` | `tr("narrow_lead")` | `NarrowScreen.tsx:65` |
| 8 | 선택지 | `.opt`(`.sel`) | `asking`, 각 choice | 서버 원문 | `NarrowScreen.tsx:67` |
| 9 | 체크 표시 | `.tick` | 항상 — **`aria-hidden` 없음, §10 D-6** | — | `NarrowScreen.tsx:74` |
| 10 | 직접 입력 | `.field` | `asking` | `tr("custom_ph")` | `NarrowScreen.tsx:78` |
| 11 | 입력 안내 | `.subhint` | `asking` | `tr("custom_hint")` | `NarrowScreen.tsx:94` |
| 12 | 되돌리기 | `.sublink` | `asking && canUndo`(연결 턴 아님) | `tr("undo_left")` | `NarrowScreen.tsx:97` |
| 13 | 빈 자리 | `span` | `asking && !canUndo` | — | `NarrowScreen.tsx:102` |
| 14 | 어려워요 | `.sublink`(`.on`) | `asking && !(connecting \|\| simplify)` | `tr("narrow_hard")` | `NarrowScreen.tsx:105` |
| 15 | 다음 | `.btn.btn-primary` | `asking` | `tr("next")` | `NarrowScreen.tsx:112` |
| 16 | 건너뛰기 | `.btn.btn-ghost` | `asking` | `tr("narrow_jump")` | `NarrowScreen.tsx:120` |

### 2-6. 난이도 선택 — `screens/difficulty/` (모듈 185행)

| # | 요소 | 클래스 | 표시 조건 | 문구 키 | 파일:행 |
|---|---|---|---|---|---|
| 1 | 종료 사유 고지 | `.listnote` | `notice` not null | `done_enough` / `done_exhausted` | `DifficultyScreen.tsx:25` |
| 2 | 상단 라벨 | `.eyebrow` | 항상 | `tr("diff_eyebrow")` | `DifficultyScreen.tsx:26` |
| 3 | 제목 | `h2` | 항상 | `tr("diff_title")` | `DifficultyScreen.tsx:27` |
| 4 | 리드 | `.lead.diffintro` | 항상 | `tr("diff_sub")` | `DifficultyScreen.tsx:28` |
| 5 | 목록 컨테이너 | `.difflist` | 항상 | — | `DifficultyScreen.tsx:30` |
| 6 | 카드 ×3 | `.diffcard` | 항상(고정) | — | `DifficultyScreen.tsx:34` |
| 7 | ㄴ 이름 | `.diffname` | 항상 | `diff_basic`/`diff_inter`/`diff_adv` | `DifficultyScreen.tsx:36` |
| 8 | ㄴ 난이도 막대 | `.diffbars` | 항상, `aria-hidden` | — | `DifficultyScreen.tsx:37` |
| 9 | ㄴ 설명 | `.diffdesc` | 항상 | `diff_*_desc` | `DifficultyScreen.tsx:43` |
| 10 | ㄴ 예시 | `.diffexTerm`/`.diffexLine` | `preview.phase==="ready"` && 샘플 존재 | 서버 원문 | `DifficultyScreen.tsx:45` |
| 11 | ㄴ 예시 자리표시 | `.diffexSkel` | 샘플 없을 때, `aria-hidden` | — | `DifficultyScreen.tsx:52` |
| 12 | 프리뷰 실패 안내 | `.listnote` | `preview.phase==="failed"` | `tr("diff_preview_failed")` | `DifficultyScreen.tsx:63` |

**불변식:** "프리뷰는 한도에 집계하지 않는 보조 정보라 실패해도 선택은 계속할 수 있어야 한다"(`DifficultyScreen.tsx:2`). 실패해도 카드 선택을 막지 않는다.

### 2-7. 어휘 목록 — `screens/terms/TermsScreen.tsx` (110행)

| # | 요소 | 클래스 | 표시 조건 | 문구 키 | 파일:행 |
|---|---|---|---|---|---|
| 1 | 담은 개수 링크 | `.link` | **`keptCount > 0`** — 재개된 세션에서는 항상 거짓, §4-8 | `kept_count` · `kept_view` | `TermsScreen.tsx:44` |
| 2 | 로딩 안내 | `.lead` | `items.length===0 && streaming` | `tr("terms_loading")` | `TermsScreen.tsx:50` |
| 3 | 어휘 카드 | `.card`(`.open`) | 각 항목 | — | `TermsScreen.tsx:56` |
| 3b | ㄴ 카드 내부 래퍼 | `.crow` | 항상. **`cursor:pointer`·`:focus-visible`·`:active`가 걸려 있으나 핸들러가 없다 — §10 D-8** | — | `TermsScreen.tsx:57` |
| 4 | ㄴ 순번 뱃지 | `.pri` | 항상 | — | `TermsScreen.tsx:58` |
| 5 | ㄴ 용어명 | `.term` | 항상 | 서버 원문 | `TermsScreen.tsx:61` |
| 6 | ㄴ 종류 칩 | `.gchip` | `t.kind` 존재 | 서버 원문 | `TermsScreen.tsx:62` |
| 7 | ㄴ 한 줄 설명 | `.oneline` | 항상 | 서버 원문 | `TermsScreen.tsx:64` |
| 8 | ㄴ 왜 문단 | `.why` | `t.why` 존재 | `tr("terms_why")` + 서버 원문 | `TermsScreen.tsx:65` |
| 9 | ㄴ 상세 패널 | `TermDetail` | 항상 마운트 | — | `TermsScreen.tsx:74` |
| 10 | ㄴ 펼치기·접기 | `.sublink` | 항상 | `detail_open` / `detail_close` | `TermsScreen.tsx:77` |
| 11 | ㄴ 담기 토글 | `.sublink`(`.on`) | 항상 | `keep_on` / `keep_off` | `TermsScreen.tsx:80` |
| 12 | 스트리밍 안내 | `.note` | `streaming && items.length>0` | `tr("terms_streaming")` | `TermsScreen.tsx:91` |
| 13 | 상한 도달 안내 | `.listnote` | `settled && reason==="capped"` | `tr("terms_capped")` | `TermsScreen.tsx:93` |
| 14 | 실패 메시지 | `.errmsg` | `failed` | `tr(errorKey(...))` | `TermsScreen.tsx:98` |
| 15 | 재시도 | `.btn.btn-ghost` | `failed && onRetry` | `tr("retry")` | `TermsScreen.tsx:101` |

**상태 처리:** 실패해도 이미 받은 카드는 남긴다 — "부분 결과도 가치가 있다". `settled`인데 `items.length===0`인 조합을 위한 문구는 **없다.** 이 조합은 가상이 아니라 `machine.ts`의 워치독 전이("done도 error도 없이 조용히 멈춘 경우")로 실제 도달한다. 스트림이 첫 카드도 못 받고 멈추면 사용자는 완전히 빈 화면을 본다.

### 2-8. 카드 상세 — `screens/terms/TermDetail.tsx` (100행)

| # | 요소 | 클래스 | 표시 조건 | 문구 키 | 파일:행 |
|---|---|---|---|---|---|
| 1 | 로딩 | `.dtext` | `loading` | `tr("detail_loading")` | `TermDetail.tsx:30` |
| 2 | 잠김 | `.nosrc` | `locked` | 서버 원문(미번역) | `TermDetail.tsx:38` |
| 3 | 실패 | `.errmsg` | `failed` | `tr(errorKey(...))` | `TermDetail.tsx:46` |
| 4 | 실패 재시도 | `.readbtn.close` | `failed` | `tr("retry")` | `TermDetail.tsx:47` |
| 5 | 개념 | `.dpart` | `open` | `tr("detail_what")` | `TermDetail.tsx:60` |
| 6 | 내 상황 | `.dpart.mine` | `open` | `tr("detail_whymine")` | `TermDetail.tsx:65` |
| 7 | 활용 단계 | `.dsteps` | `open` | `tr("detail_how")` | `TermDetail.tsx:72` |
| 8 | 메모 | `.dmemo` | `open && out.misc` | 서버 원문 | `TermDetail.tsx:79` |
| 9 | 출처 라벨 | `.dlabel` | `open` | `tr("detail_sources")` | `TermDetail.tsx:82` |
| 10 | 출처 링크 | `.src` | `open && sources.length>0` | 서버 원문 | `TermDetail.tsx:85` |
| 11 | 출처 없음 | `.nosrc` | `open && sources.length===0` | `tr("detail_nosrc")` | `TermDetail.tsx:94` |
| 12 | (아무것도 안 그림) | — | 다른 카드가 열렸거나 `closed` | — | `TermDetail.tsx:25` |

**불변식:** "출처가 비어 있으면 없다고 말한다. 지어내지 않는다"(`TermDetail.tsx:1-2`). "근거 없는 귀속보다 없다고 말하는 것이 낫다"(`:93`). 잠김은 실패와 다른 상태라 재시도 버튼을 주지 않는다 — "지금 다시 눌러도 안 되는 것. 재시도 버튼을 띄우면 사용자가 헛되이 누른다"(`detail-machine.ts:77`).

### 2-9. 담은 어휘 — `screens/kept/KeptScreen.tsx` (53행)

| # | 요소 | 클래스 | 표시 조건 | 문구 키 | 파일:행 |
|---|---|---|---|---|---|
| 1 | 뒤로 링크 | `.link` | 항상 | `tr("kept_back_terms")` | `KeptScreen.tsx:23` |
| 2 | 제목 | `h2` | 항상 | `tr("kept_title")` | `KeptScreen.tsx:24` |
| 3 | 안내 | `.lead` | 항상(문구가 갈림) | `kept_some` / `kept_none` | `KeptScreen.tsx:25` |
| 4 | 카드 | `.card` | 각 항목 | — | `KeptScreen.tsx:28` |
| 5 | ㄴ 어휘명 | `.term` | 항상 | — | `KeptScreen.tsx:32` |
| 6 | ㄴ 품사 칩 | `.gchip` | `t.kind` 존재 | — | `KeptScreen.tsx:33` |
| 7 | ㄴ 한 줄 설명 | `.oneline` | 항상 | — | `KeptScreen.tsx:35` |
| 8 | ㄴ 빼기 | `.readbtn.close` | 항상 | `tr("keep_on")` | `KeptScreen.tsx:38` |
| 9 | 종착 이동 | `.btn.btn-primary` | `kept.length > 0` | `tr("kept_to_primer")` | `KeptScreen.tsx:45` |
| 10 | 홈 링크 | `.link` | 항상 | `tr("kept_back_home")` | `KeptScreen.tsx:50` |

**불변식:** "종착으로 가는 주 버튼(T-10). 담기 수로 자동 전환하지 않는다 — 계속 담고 싶은 사용자를 끊는 것이 오히려 마찰이다"(`KeptScreen.tsx:42-43`). "붙여넣을 본문은 여기 없다 — 종착 화면으로 옮겼다(T-1)"(`:1-5`).
**접근성:** 이 파일에 `aria-*`·`role`이 **하나도 없다.**

### 2-10. 종착(프라이머) — `screens/primer/PrimerScreen.tsx` (110행)

| # | 요소 | 클래스 | 표시 조건 | 문구 키 | 파일:행 |
|---|---|---|---|---|---|
| 1 | 뒤로 링크 | `.link` | 항상 | `tr("kept_back_terms")` | `PrimerScreen.tsx:66` |
| 2 | 제목 | `h2` | 항상 | `tr("primer_title")` | `PrimerScreen.tsx:67` |
| 3 | 구분선 | `.divider` | 항상 | `tr("primer_included")` | `PrimerScreen.tsx:69` |
| 4 | 빈 안내 | `.listnote` | `chosen.length===0` | `tr("primer_none")` | `PrimerScreen.tsx:71` |
| 5 | 포함 항목 | `.incRow` | `chosen` 각 항목 | — | `PrimerScreen.tsx:74` |
| 6 | ㄴ 어휘명 | `.incTerm` | 항상 | — | `PrimerScreen.tsx:75` |
| 7 | ㄴ 한 줄 설명 | `.incLine` | 항상 | — | `PrimerScreen.tsx:76` |
| 8 | ㄴ 빼기 | `.incDrop` | 항상, `aria-label={t.term}` | — | `PrimerScreen.tsx:77` |
| 9 | 본문 미리보기 | `.nosrc.primerText` | 항상 | — | `PrimerScreen.tsx:83` |
| 10 | 복사 버튼 | `.btn.btn-primary` | 항상(`chosen` 0이면 disabled) | `copy` / `copy_done` | `PrimerScreen.tsx:86` |
| 11 | 복사 실패 | `.errmsg` | `copied==="fail"` | `tr("copy_fail")` | `PrimerScreen.tsx:89` |
| 12 | **복사 성공 안내(빈자리)** | `.listnote` | `copied==="ok"` | `tr("primer_saved")` | `PrimerScreen.tsx:91` |
| 13 | AI 정리 버튼 | `.refinebtn` | `onRefine` 존재 | `ai_extra` / `refine_loading` | `PrimerScreen.tsx:95` |
| 14 | 잠금 안내 | `.listnote` | `phase==="locked"` | `tr(state.key)` | `PrimerScreen.tsx:99` |
| 15 | 실패 안내 | `.errmsg` | `phase==="failed"` | `tr(state.key)` | `PrimerScreen.tsx:100` |
| 16 | 홈 링크 | `.link` | 항상 | `tr("kept_back_home")` | `PrimerScreen.tsx:102` |
| 17 | 출처 패널(우측 열) | `.primerAside` | DOM 항상, <64em CSS 숨김 | — | `PrimerScreen.tsx:106` |
| 18 | 편집 시트·FAB | `EditSheet` | 항상 마운트 | — | `PrimerScreen.tsx:107` |

**불변식:** "화면이 그리는 목록과 클립보드 문자열이 **같은 집합**에서 나온다(T-2)"(`:35`). "붙여넣을 글 그대로. 화면이 보여준 것과 복사되는 것이 같다는 것을 눈으로 확인할 수 있어야 한다"(`:82`). "넓은 화면: 우측 열. 좁은 화면: 같은 컴포넌트가 시트 안으로(T-6). CSS가 어느 쪽을 보일지 정한다"(`:105`).

### 2-11. 출처 패널 — `screens/primer/SourcePanel.tsx` (53행)

| # | 요소 | 클래스 | 표시 조건 | 문구 키 | 파일:행 |
|---|---|---|---|---|---|
| 1 | 세션 그룹 | `.srcGroup` | `session.length>0` | — | `SourcePanel.tsx:36,48` |
| 1b | ㄴ 그룹 제목 | `.srcHead`(`h3`) | 항상(그룹 내). `aria-labelledby` 연결은 없다 | `tr("primer_scope_session")` | `SourcePanel.tsx:39` |
| 2 | 어휘 블록 | `.srcBlock`(`.on`) | 각 항목, `aria-pressed` | — | `SourcePanel.tsx:22` |
| 3 | ㄴ 어휘명 | `.srcTerm` | 항상 | — | `SourcePanel.tsx:23` |
| 4 | ㄴ 저장 태그 | `.srcTag` | `src.kept` | `tr("primer_from_kept")` | `SourcePanel.tsx:26` |
| 5 | ㄴ 조회 태그 | `.srcTag` | `src.viewed` | `tr("primer_from_viewed")` | `SourcePanel.tsx:27` |
| 6 | ㄴ 한 줄 설명 | `.srcLine` | 항상 | — | `SourcePanel.tsx:29` |
| 7 | 자산 그룹 | `.srcGroup` | `assets.length>0` | `tr("primer_scope_assets")` | `SourcePanel.tsx:36,49` |
| 8 | 마인드맵 슬롯 | — | `mapPanel` non-null | — | `SourcePanel.tsx:50` |

**불변식:** "저장과 조회는 동시에 참일 수 있다(C5-S1 E-1). 둘 다면 둘 다 붙는다"(`:25`). "넓은 화면에서는 우측 열, 좁은 화면에서는 바텀시트 본문으로 **같은 컴포넌트**가 쓰인다(T-6). 두 벌로 만들면 한쪽만 고쳐져 갈라지고 컴파일은 계속 된다 — D-12가 막으려는 상태다"(`:1-2`).
**빈 상태:** 그룹이 비면 그룹 자체가 `null`이고 빈 안내 문구조차 없다. 둘 다 비고 `mapPanel`도 null이면 `.srcPanel`이 완전히 빈 채로 렌더된다.

### 2-12. 편집 시트 — `screens/primer/EditSheet.tsx` (71행) — 제품의 유일한 모달형 표면

| # | 요소 | 클래스 | 표시 조건 | 문구 키 | 파일:행 |
|---|---|---|---|---|---|
| 1 | 편집 진입 FAB | `.editFab` | `visible` && <64em | `tr("primer_edit")` | `EditSheet.tsx:53` |
| 2 | ㄴ 아이콘 | — | 항상, `aria-hidden` | — | `EditSheet.tsx:54` |
| 3 | 스크림 | `.sheetScrim` | `open` | — | `EditSheet.tsx:59` |
| 4 | 시트 본체 | `.sheet` | `open`, `role="dialog" aria-modal` | — | `EditSheet.tsx:60` |
| 5 | ㄴ 핸들 | `.sheetHandle` | 항상, `aria-hidden` | — | `EditSheet.tsx:61` |
| 6 | ㄴ 닫기 링크 | `.link.sheetClose` | 항상 | `tr("detail_close")` | `EditSheet.tsx:62` |
| 7 | ㄴ children | — | 항상 | — | `EditSheet.tsx:65` |

**FAB 표시 조건이 폭이 아니다.** `watchRef`(복사 버튼 래퍼)를 `IntersectionObserver(threshold:0)`로 관찰해 끄트머리라도 보이면 참이다. 근거가 주석에 있다 — "표시 조건이 화면 폭이 아니라 '이대로 복사'의 가시성이다(사용자 확정 2026-08-03)... 복사 버튼이 눈에 들어왔다는 것은 종착에 도달했다는 뜻이다"(`:3-5`). 관찰자가 없는 환경에서는 무조건 참으로 둔다 — "안 띄우면 편집 경로가 통째로 사라져, 관측 실패가 기능 상실이 된다".

**키보드·포커스 전수**

| 항목 | 상태 |
|---|---|
| ESC 닫기 | **있음** (`:41-48`, `open`일 때만 리스너) |
| 스크림 클릭 닫기 | 있음. **클릭 이벤트 기반이라 터치 탭도 동작한다.** 키보드만 불가(`div`에 `tabIndex`·`role` 없음) |
| 포커스 트랩 | **없음** |
| 열릴 때 초기 포커스 이동 | **없음** — `sheetRef`가 선언·연결됐으나 어디서도 읽히지 않는다(§10 D-5) |
| 닫힐 때 포커스 복귀 | **없음** |
| 배경 스크롤 잠금 | **없음** |
| `aria-labelledby` 연결 | **없음** — `role="dialog"`가 어떤 제목과도 연결되지 않는다 |

### 2-13. 로그인 위젯 — `screens/auth/` (246행)

라우팅되지 않는다. `AppShell`의 `footer` 슬롯에 항상 박혀 `journey.at`과 무관하게 산다.

| # | 요소 | 클래스 | 표시 조건 | 문구 키 | 파일:행 |
|---|---|---|---|---|---|
| 1 | 로그인 중 | `.sbEmpty` | `available && exchanging` | `tr("auth_signing_in")` | `AuthButton.tsx:19` |
| 2 | 로그아웃 | `.sublink` | `available && signed_in` | `tr("auth_sign_out")` | `AuthButton.tsx:24` |
| 3 | 로그인 | `.sublink` | `available && (anonymous\|failed)` | `tr("auth_sign_in")` | `AuthButton.tsx:32` |
| 4 | 실패 메시지 | `.errmsg` | `available && failed` | **하드코드 한국어**, `tr()` 미경유 | `AuthButton.tsx:35` |

**불변식:** "client_id가 없으면 아예 그리지 않는다. 없는 채로 버튼을 띄우면 눌러서 깨진다. 기능이 없는 것과 고장난 것은 다르다(A-2)"(`AuthButton.tsx:1-2`). "로그인은 관문이 아니다. 여기가 실패해도 앱의 나머지는 그대로 돈다(A-1)"(`useAuth.ts:2`). 로그아웃은 캐시 삭제를 동반한다 — 같은 기기 다음 사용자에게 남의 목록이 보이면 소유권 규칙 위반(`journey.tsx:96-97`).
**접근성:** `screens/auth/` 전체에 `aria-*`·`role`이 **하나도 없다.**

### 2-14. 고위험 거부 — `screens/RefusalScreen.tsx` (20행)

| # | 요소 | 클래스 | 표시 조건 | 문구 키 | 파일:행 |
|---|---|---|---|---|---|
| 1 | 거부 제목 | `h2` | 항상 | `tr("refusal_title")` | `RefusalScreen.tsx:14` |
| 2 | 처음으로 | `.btn.btn-ghost` | 항상 | `tr("refusal_home")` | `RefusalScreen.tsx:15` |

**불변식:** "정본은 서버의 HIGH_RISK_REFUSED 응답 문구이며 여기 값은 그것과 한 글자도 달라선 안 된다 — 다르면 정본이 둘이 된다"(`strings.ts:195-196`).

### 2-15. 랜딩 — `packages/landing/src/pages/index.astro` (238행)

별도 Astro 정적 앱. 페이지 파일은 이것 하나뿐이고 브라우저 JS 0을 목표로 한다(L-1). 나가는 경로는 `/app` 링크 하나.

**ui-shared와 공유하는 것은 `vars.css` 하나뿐이다.** 컴포넌트·훅·i18n 어느 것도 import하지 않는다(L-2). `bundle.css`를 가져왔다가 본문이 스크롤 판이 되고 제목에 밑줄이 붙는 붕괴를 한 번 겪었고, 지금은 `boundary-check.mjs`가 막는다. 랜딩 CSS는 전부 `lp-` 접두어를 써서 앱 클래스와 충돌해 조용히 상속받는 것을 막는다.

---

## 3. 슬롯 — 확장 지점

| 슬롯 | 타입 | 선언 | 주입 | 현재 값 | 비었을 때 |
|---|---|---|---|---|---|
| `sessions` | 주입 노드 | `AppShell.tsx:33` | 값 조립 `journey.tsx:211-217`, 주입 `:222` | `SessionList` | 대체 문구 |
| `projects` | 주입 노드 | `AppShell.tsx:35` | 값 조립 〃, 주입 `:223` | `ProjectList` | 대체 문구 |
| `footer` | 주입 노드 | `AppShell.tsx:38` | `journey.tsx:225` | `AuthButton` | `.sbFoot:empty`가 빈 띠를 막는다 |
| `mapPanel` | `ReactNode \| null` | `PrimerScreen.tsx:24` → `SourcePanel.tsx:16` | `journey.tsx:288` | **`null`** | 절 자체가 안 뜬다 |
| `children` | `ReactNode`(필수) | `EditSheet.tsx:17` | `PrimerScreen.tsx:107` | `panel` | 해당 없음 |
| `offlineNotice` | 문자열\|null | `sidebar-slots.tsx:14` | `journey.tsx:216` | 조건부 | 고지 없음 |

**`mapPanel`이 이 제품의 슬롯 관례 정본이다.** 타입 있는 옵셔널 prop으로 선언하고, 배선 파일이 `null`을 명시적으로 주입하고, 소비처가 `{slot ?? null}`로 렌더한다. 비면 빈 래퍼조차 만들지 않는다. 주석이 근거를 적어둔다 — "`ShellDeps.auth`·`offline`과 같은 능력 모델이다".

**주의:** `panel` 상수가 `.primerAside`와 `EditSheet` children **두 자리에 같은 인스턴스로 쓰인다.** 평상시에는 `64em` 분기가 둘을 상호배타로 갈라놓지만, 시트의 `open` 상태는 리사이즈에 반응하지 않는다. **좁은 화면에서 시트를 연 채 뷰포트를 `64em` 이상으로 넓히면** 우측 열이 나타나는 동시에 열린 시트도 남아 두 인스턴스가 실제로 동시에 보인다. 둘 중 하나만 고르는 로직은 없다.

**`EntryScreen`에는 슬롯이 없다.** props는 `notice`·`attachLocked`·`maxContextChars`·`onSubmit` 넷뿐이다. 진입 화면에 무언가를 꽂으려면 이 관례를 따라 슬롯을 신설해야 한다.

---

## 4. 레이아웃 불변식

### 4-1. 입력창 불변 위치 (진입 화면)

`shell.css`의 `.entryMain .hero` 규칙에 붙은 주석이 정본이다.

> 입력창은 불변 위치다. 아래에 예시칩이 몇 줄 붙든, 나중에 세션 목록이 들어오든 입력창은 같은 자리에 있어야 하고 늘어나는 것은 아래로 흘러야 한다. 그래서 덩어리를 통째로 가운데 정렬하지 않고 위에서 일정 비율만큼 띄우고 시작한다. 덩어리를 가운데 정렬하면 아래가 길어질수록 입력창이 위로 밀린다. v1은 그걸 translateY로 상쇄했는데 아래 내용이 바뀔 때마다 값이 어긋나는 방식이었다. **위에 오는 것은 제목과 부제뿐이라 이 자리는 변하지 않는다.**

**마지막 문장은 이미 사실이 아니다.** `notice`가 `.hero` 바깥 위에 렌더되고, `.entryMain`이 세로 flex이며 `.hero`가 `flex:1`이므로 `notice`가 뜨면 히어로 전체가 아래로 밀린다. 무보호 삽입의 선례가 이미 출시돼 있다.

정확히 무엇이 보호되는가.

| 대상 | 보호 여부 |
|---|---|
| 제목·부제 | `.heroHead` 고정 높이 `clamp(8rem, 36vh, 28rem)` 안. 내용이 늘어도 박스 높이 불변 |
| 입력창 **위치**(top) | 고정 박스 덕에 시작점 불변. 간접 수혜 |
| 입력창 **크기** | 보호 없음. `grow()`가 내용에 따라 늘린다(상한 `max-height:10rem`) |
| 칩·조건 입력·오류 문구 | 보호 없음. 아래로 흐른다 |
| `.hero` **위**의 것 | **보호 없음.** 히어로 전체를 밀어낸다 |

### 4-2. 확장 자리 지정

`.entryMain .heroHead` 주석이 어디에 무엇이 붙을지 미리 적어놨다.

> 아래쪽에 여백을 남겨 두는 것은 의도다. 예시칩과 **앞으로 붙을 기능**이 그 공간으로 흘러내린다.

그리고 오로라 주석이 그 구역을 배경 처리에서 제외한다 — "제목과 부제 위, **하단 history 제외**".

### 4-3. 폭 상한을 셸이 아니라 요소에 준다

> 오로라 같은 배경은 열 전체에 깔려야 하는데 셸에 상한을 주면 거기서 잘려 판때기처럼 보인다. 그래서 폭 상한은 셸이 아니라 글과 입력창에만 준다.

진입 화면만 예외적으로 컨테이너가 아니라 자식 요소들에 `max-width`를 준다.

### 4-4. 사이드바 폭 상한

`--sidebar-w: clamp(13rem, 18vw, 16.5rem)`(`scale.css`). 이 한 값이 좁은 화면 드로어 폭과 넓은 화면 그리드 첫 열 양쪽에 쓰여, 어느 폭에서도 264px을 넘지 않는다. FR-704의 "화면 전체를 덮지 않는다"를 이 값이 만족시킨다. 단 C3-S5 스펙은 넓은 화면 기준을 미정으로 남겨두고 있다.

### 4-5. 빈 컨테이너가 테두리만 남기는 결함

> 안에 든 것이 아무것도 그리지 않으면 테두리만 남은 빈 띠가 된다. 셸은 자식이 null을 반환할지 알 수 없으므로 호출부에 맡기지 않고 여기서 막는다. **같은 유형의 결함을 넓은 화면 헤더에서 이미 한 번 겪었다.**

`.sbFoot:empty{display:none}`이 그 방어다. 슬롯을 새로 만들 때 같이 고려해야 하는 패턴이다.

### 4-6. 헤더 회귀 사례

`shell.css`의 넓은 화면 블록 주석이 실측 회귀를 기록하고 있다. 헤더가 한때 통째로 숨겨져 있었고, 언어 선택이 헤더로 들어오면서 전제가 깨졌는데 숨긴 채로 배포돼 **데스크톱에서 언어를 바꿀 방법이 사라진 적이 있다.** 조건부 숨김의 전제가 바뀌는 것을 아무도 안 잡아준다는 사례다.

### 4-7. 진입 화면 칩 아래에 무언가를 놓을 때의 함정

C5-S3가 그 자리에 카드를 놓기로 했으므로 미리 모아 둔다. 일곱 개 전부 CSS를 읽어야만 나오는 것들이다.

| # | 함정 |
|---|---|
| 1 | **붙일 자리가 셋이다.** `.heroGlow` 안(`.suggest` 형제) / `.hero` 안(`.heroGlow` 형제) / `.entryMain` 안(`.hero` 형제). 결과가 셋 다 다르다 |
| 2 | **오로라가 따라온다.** `.heroGlow` 안에 넣으면 `.aurora{bottom:0}`이 새 요소까지 덮어 §4-2의 "하단 제외"가 깨진다 |
| 3 | **읽기 폭을 두 목록에 등록해야 한다.** `shell.css`의 좁은 화면용·넓은 화면용 두 선택자 목록에 새 클래스를 넣지 않으면 상한이 아예 안 걸린다. 진입 화면의 `<main>`은 `pad` 클래스가 없고 `#app{max-width:none}`이라 뷰포트 전체 폭으로 늘어난다 |
| 4 | **`.heroGlow`는 flex가 아니라 block이다.** 형제 간격이 전부 `margin-top` 관례로 만들어져 있어, 2트랙을 flex/grid로 짜며 `gap`을 쓰면 margin과 겹쳐 이중 여백이 생긴다 |
| 5 | **칩 아래에 이미 예약된 여백이 있다.** `.suggest{padding-bottom}` 안에 "다시 뽑기" 버튼이 절대 위치로 떠 있다. 바로 붙이면 설명되지 않는 간격이 생긴다 |
| 6 | **`.hero{flex:1}`이 남는 세로를 다 먹는다.** `.hero`의 형제로 붙이면 뷰포트가 클수록 새 요소가 화면 아래로 밀려 스크롤해야 보인다. 재인이 목적인 요소에는 치명적이다 |
| 7 | **화면 전체가 드롭존이다.** `<main>`에 `onDragOver`·`onDrop`이 걸려 있어(§2-4 행 0) 새 요소의 상호작용이 버블링으로 파일 첨부 로직과 충돌할 수 있다 |

### 4-8. 세션을 재개하면 담기 상태가 복원되지 않는다

`journey.tsx`의 `kept`는 `useState<KeptMap>(emptyKept)`인 순수 로컬 상태이고 주석이 "담기는 화면 상태로만 유지한다"고 못박는다. 재개 경로는 생성 목록만 복원하고 `setKept`를 호출하지 않으며, `Resume` 유니온 타입 자체에 담기 필드가 없다.

결과가 화면에 그대로 나온다. `TermsScreen`은 담은 어휘 링크를 `keptCount > 0`일 때만 그리므로(§2-7 행 1), **재개된 세션에서는 그 링크가 아예 렌더되지 않는다.** 이전에 몇 개를 담았든 마찬가지다.

데이터는 서버에 있다. `AssetTerm`이 `session_id`를 갖고, `keep`/`unkeep` 포트가 있고, 담기 토글마다 `syncKeep`이 이미 서버에 쓴다. **없는 것은 저장이 아니라 재개 시 되읽는 배선이다.**

---

## 5. 반응형 분기

분기점은 **`64em` 하나로 통일**돼 있다. `scale.css`에는 미디어 쿼리가 없다(전 구간 rem 고정).

| ≥64em에서 바뀌는 것 | 내용 |
|---|---|
| 셸 | 1열 → 2열 그리드. 사이드바가 `position:static` 상시 열 |
| 스크림 | `display:none` |
| 본문 테두리 | 왼쪽 테두리 제거 |
| 읽기 폭 | `--measure`(35rem) → `--measure-wide`(38.75rem) |
| 오로라 | 좌우 마스크 추가 |
| 사이드바 토글·헤더 브랜드 | `display:none` |
| 프라이머 레이아웃 | 1열 → `minmax(0,1fr) 18rem` 2열 (`primer.css`) |
| 출처 패널 | `display:none` → `block` |
| 편집 FAB | 보임 → `display:none` |

그 외 좁은 쪽 분기 두 개. `21.5625em` 이하에서 헤더를 압축하는 규칙이 있으나 **셀렉터가 마크업과 안 맞아 안 걸린다**(§10 D-2). 랜딩은 자체 `30rem` 분기 하나를 갖는다.

**핵심:** 넓은 화면에서 사이드바는 드로어가 아니라 상시 2열이다. 따라서 사이드바 목록과 본문의 내용이 동시에 보이는 것이 데스크톱의 기본 상태다.

---

## 6. 상태 관례

| 상태 | 이 제품의 관례 |
|---|---|
| 로딩 | 스켈레톤은 난이도 예시 한 곳뿐. 나머지는 **문구 한 줄** 또는 아무것도 안 그린다. 스피너는 저장소 전체에 없다 |
| 비어 있음 | 목록마다 전용 문구가 있다. 단 어휘 목록이 `settled`인데 0건인 조합은 문구가 없다 |
| 실패 | `.errmsg` + 재시도 버튼. **부분 결과는 남긴다** |
| 잠김 | 실패와 **다른 상태**로 다룬다. 재시도 버튼을 주지 않는다 |
| 오프라인 | 전용 UI는 세션 목록의 `notice` 하나뿐. 나머지 화면은 네트워크 오류를 일반 실패로 흡수한다 |
| 비로그인 | 목록에서 `off`로 조기 반환. 빈 목록과 다른 축으로 다룬다 |

세 축이 다르다는 원칙이 `SessionList` 주석에 명시돼 있다. 비로그인·오프라인·빈 목록은 각각 다른 뜻이고 문구도 다르다.

---

## 7. 접근성 관례 전수

`packages/ui-shared/src` 기준. `aria-*` 24건, `role=` 1건.

| 속성 | 개수 | 위치 |
|---|---|---|
| `aria-label` | 13 | `LangSelect:13`, `AppShell:64`, `ProjectList:44,58`, `SessionList:53,69`, `EditSheet:53`, `PrimerScreen:77`, `NarrowScreen:82`, `EntryScreen:148,192,202,219` |
| `aria-hidden` | 8 | `AppShell:11,21`, `EditSheet:54,61`, `EntryScreen:40,142`, `DifficultyScreen:37,52` |
| `aria-expanded` | 1 | `EditSheet:53` |
| `aria-modal` | 1 | `EditSheet:60` |
| `aria-pressed` | 1 | `SourcePanel:22` |
| `role="dialog"` | 1 | `EditSheet:60` |

**있는 관례**

- 장식 요소에 `aria-hidden`을 일관되게 붙인다
- 텍스트 라벨 없는 아이콘 버튼에 `aria-label`을 붙이고, 값은 **전부 문구 키 경유**다(하드코드 없음)
- 토글 버튼에 `aria-pressed`
- 유일한 모달에 `role="dialog"` + `aria-modal`

**없는 것**

- `aria-live`·`aria-busy`·`aria-describedby`·`aria-current`·`aria-controls`·`aria-selected`·`aria-invalid` — **전무.** 로딩 문구가 여럿인데 라이브 리전이 하나도 없다
- `role`이 `dialog` 외에 쓰인 적 없다
- `tabIndex`·`autoFocus` — **0건**
- 포커스 트랩·초기 포커스·복귀 처리 — 없다
- 스크린리더 전용 텍스트 클래스 — CSS에 없다
- `onKeyDown` 3곳은 전부 입력창 Enter 제출이지 키보드 내비게이션이 아니다
- `.focus()` 프로그래밍 호출은 `EntryScreen:115` 한 곳(칩 클릭 시 입력창으로)

**예외 1건:** 좁히기 체크 표시가 장식인데 `aria-hidden`이 없다(§10 D-6).

---

## 8. 문구 표 구조

**키 137개.** `strings.ts`의 `ko`가 유일한 타입 정본이고 `StringKey = keyof typeof ko`다.

`ko`는 손으로 관리한다 — "주석에 판단이 들어 있고, 생성으로 덮으면 그것이 사라진다". `en`·`ja`·`zh`는 `port-i18n.mjs`가 생성한다.

**`STRINGS`가 `Record<OutputLocale, Record<StringKey, string>>`이라 키를 하나 추가하면 세 로케일이 전부 타입 에러로 깨진다.** 이것이 의도다(S-19) — 한국어만 채워진 채로 배포되는 경로를 타입이 막는다.

**새 키를 4개 언어에 올리는 경로**

1. `ko`에 키 추가 → 나머지 셋이 타입 에러
2. `port-i18n.mjs` 실행. 각 키를 순서대로 찾는다: v1 이식분 → **`AUTHORED` 상수** → 스펙 초안표(`C3-S5-세션과프로젝트.md` §6-2)
3. 셋 다 없으면 종료 코드 1과 함께 안내가 나온다

> 문구를 못 찾은 키 N건 — AUTHORED에 넣거나 스펙 초안표에 행을 추가할 것

4. `--write`를 줘야 파일을 쓴다. 없으면 빈 칸만 보고한다

**v2 신규 문구는 `AUTHORED`에 손으로 넣는 것이 정식 경로다.** 스펙 초안표 경로는 `C3-S5` 파일 하나만 읽으므로 다른 슬라이스는 쓸 수 없다.

**`DEAD`** 는 소비처가 사라진 키를 표에서 빼는 목록이다. `check-i18n.mjs`는 "키가 모든 로케일에 있으면 통과"라 죽은 키를 스스로 못 잡는다. `paste_sub`가 사전 기조(T-15)를 어긴 문구를 든 채 4개 로케일에 남아 있던 것이 이 목록을 만든 계기다.

**`check-i18n.mjs`가 실제로 보는 것** — 키 집합 일치는 안 본다(타입이 이미 막으므로). 대신 셋을 본다. 자리표시자 불일치(`{n}` 누락 → 숫자가 조용히 사라짐), 빈 문자열, ko와 글자까지 같은 경우(경고, `SAME_AS_KO_OK` 등록 가능). AI 작성분 건수는 정보로만 보고한다 — "줄어야 하는 것처럼 실패를 내면 게이트가 거짓말을 한다".

**함정:** 이 검사는 `dist`를 소비하므로 빌드가 선행돼야 한다. 잊으면 옛 표를 검사해 통과·실패가 둘 다 거짓이 된다. 실측으로 한 번 겪었다.

**받침 조사 유틸은 저장소 전체에 없다.** `v1`·`v2` 모두 검색했고 걸린 것 둘은 목적이 다르다. `utils.ts`의 `normalizeTopic()`은 캐시 키를 위해 조사를 **제거**하는 함수이고, `core/locale`의 "조사"는 research의 번역어다. 기존 문구들은 조사가 안 붙는 형태로 회피하고 있다(예: `kept_count: "담은 어휘 {n}"`).

---

## 9. 디자인 토큰 진입점

**`vars.css`** (43행)는 `:root` 토큰 선언 한 블록이다. 라이트 값과 `prefers-color-scheme: dark` 오버라이드만 있다. 값은 v1에서 계승했고 **이 파일에서 값을 바꾸지 않는다.**

담긴 그룹: 배경·표면(`--bg --surface --surface-2 --border`), 텍스트(`--text --muted --faint`), 프라이머리, 액센트 5종, 룰선, 그라디언트, 글로우, 그림자, 경고 3종, 오로라 3종.

**치수 토큰은 여기 없고 `scale.css`에 있다** — `--entry-pad`·`--measure`·`--measure-wide`·`--sidebar-w`. `:root` 변수의 출처는 두 파일이다.

**이름 함정:** `tokens.css`는 이름과 달리 토큰 파일이 아니다. **540행짜리 앱 컴포넌트 스타일시트**이고 실제 토큰은 맨 위 `@import "./vars.css"` 한 줄로만 들어온다. 처음에 변수 진입점을 `tokens.css`라는 이름으로 내보냈다가 이 동명이인이 결함으로 잡혔고, 그래서 지금 이름이 `vars.css`다.

**손으로 맞춰야 하는 다섯 곳.** 진입점 이름이나 exports 매핑을 바꾸려면 함께 움직여야 한다. 하나만 어긋나면 게이트가 조용히 통과하거나 조용히 막는다.

1. **`ui-shared/package.json`의 `"exports"."./vars.css"` 매핑** — 이것이 정본이고 나머지가 이걸 가리킨다
2. `boundary-check.mjs`의 `ASSET_ALLOWED`
3. 랜딩의 import 한 줄
4. 스펙 `C3-S6-랜딩.md` §3·§4·§5
5. `ui-shared/README.md`의 진입점 표

`_shadow` 노트는 넷으로 적고 있으나 1번이 빠져 있다. 이 문서는 다섯으로 센다.

**재사용해도 되는 것:** `vars.css`의 색·그림자·그라디언트 변수, `scale.css`의 치수 변수.
**건드리면 안 되는 것:** `tokens.css` 본문(디자인 변경 금지), `vars.css`의 값 자체, 그리고 **CSS를 절대 행 번호로 지목하는 것.**

---

## 10. 드리프트 — 인덱스가 잡은 것

인덱스를 만드는 과정에서 나온 것이며 **이 문서의 부산물이지 목적이 아니다.** 판단과 처리는 별도다.

| ID | 내용 | 근거 | 상태 |
|---|---|---|---|
| **D-1** | ~~`ProjectList` 의 `<ul>` 이 `.drawerWrap`(v1 플로팅 오버레이, `position:fixed;inset:0;z-index:45`)을 쓰고 있었다~~ **해소(C5-S3, 2026-08-18).** `.plist` 신설로 교체 | 실측 | **확정된 결함이었다.** 넓은 화면에서 `elementFromPoint` 가 입력창·칩·카드·전송 버튼·사이드바 항목 **다섯 곳 모두** `UL.drawerWrap` 을 돌려줬다 — 로그인한 사용자에게 앱이 통째로 안 눌렸다. 교체 후 같은 다섯 좌표가 각자의 요소를 돌려준다 |
| **D-2** | `21.5625em` 이하 헤더 압축 규칙의 부제 숨김 셀렉터가 `.brand span span`인데 마크업이 중첩 구조가 아니다. 이 규칙은 한 번도 안 걸린다 | 코드 대조 | 확인됨 |
| **D-3** | `.progress`·`.track`·`.track.base`·`.track.extra`·`.promark`·`.prolock` 전체에 소비자가 없다. 좁히기 진행 표시는 텍스트 `.rangehint`가 한다. 주석은 "기본 트랙은 좌측 절반"이라는데 값은 `flex:0 0 31%` | grep 0건, 직접 확인 | 확인됨 |
| **D-4** | `.card.kept` 정의만 있고 사용처 없음 | grep | 확인됨 |
| **D-5** | `EditSheet`의 `sheetRef`가 선언·연결됐으나 어디서도 읽히지 않는다. 포커스 트랩을 만들려다 만 흔적 | 코드 대조 | 확인됨 |
| **D-6** | 좁히기 선택지 체크 표시가 장식인데 `aria-hidden`이 없다. 다른 화면들은 전부 붙인다 | 코드 대조 | 확인됨 |
| **D-7** | `useDetail`의 `close` 액션이 어디서도 호출되지 않는다 | grep | 확인됨 |
| **D-8** | `.crow`에 `cursor:pointer`와 `:focus-visible` 스타일이 있으나 해당 `div`에 `onClick`·`tabIndex`·`role`이 없다. 클릭 가능해 보이지만 아니다 | 코드 대조 | 확인됨 |
| **D-9** | `.modalCard`·`.tutCard`·`.plancard`·`.summary`·`.callout` 미사용. 동적 조립·타 패키지·빌드 산출물까지 확인 | 전수 대조 | **미사용 확정** |
| **D-10** | `.card.open .chev`가 정의돼 있으나 `.chev` 요소가 TSX 어디에도 없다. 펼침 표시용 쉐브론이 스타일로만 설계돼 있다 | grep | 확인됨 |
| **D-11** | `.sbSearch`는 **정의가 없다.** 소비처는 둘(`SessionList`·`ProjectList`)인데 어느 스타일시트에도 규칙이 없어 브라우저 기본 스타일로 렌더된다. v1의 `.search`/`.searchwrap`이 이름만 바뀌고 CSS가 안 따라온 흔적 | 전수 grep | 확인됨. **지금까지와 반대 방향의 드리프트** |
| **D-12** | 죽은 CSS의 규모가 D-3·D-4·D-9가 대표하는 것보다 훨씬 크다. `tokens.css`의 클래스 177개를 대조한 결과 **약 70개**가 소비처 없이 남아 있다 — 튜토리얼 세트 약 15종, AI 대화 카드 세트, 요금제, 스낵바, 모달 배경 등 | 1차 스크리닝 | **강한 정황.** 개별 전수 확인은 D-9의 5개만 마쳤다 |
| **D-13** | ~~**v1 재방문 카드 스타일이 통째로 남아 있다.**~~ **해소(C5-S3).** 아홉 규칙 삭제, `.rcard` 계열 신설. `.resume`·`.resume:hover`·`.resume:active`·`.resumeText`·`.resumeEy`·`.resumeText b`·`.resumeMeta`·`.resumeGo`·`.resume.inprog` 아홉 규칙. v2 소비처 0. 문구 키(`resume_*`)는 v2 문구표에 넘어오지 않았다 | 코드 대조 | 확인됨. **C5-S3 직결 — §11 참조** |

**기존 게이트의 사각지대:** 관계 인덱스는 CSS 클래스를 정의로 나열하지만 `readers=` 수를 붙이지 않는다. 그 표기는 export된 심볼에만 있다. **따라서 죽은 CSS는 현재 어떤 게이트에도 안 걸린다.** D-3·D-4·D-9·D-12·D-13이 전부 그 결과다.

---

## 11. C5-S3가 알아야 할 것 — v1 재방문 카드 잔존물

D-13은 다음 슬라이스에 직접 걸리므로 따로 편다.

`tokens.css`에 v1의 재방문 카드 스타일이 완성된 형태로 살아 있고 v2에서는 아무도 쓰지 않는다. v1 마크업 구조는 이렇다.

```
button.resume (.inprog 조건부)
└ span.resumeText
  ├ span.resumeEy      상태 라벨 — 진행 중이면 알약, 아니면 "이어서"
  ├ b                  분야 또는 주제
  └ span.resumeMeta    "어휘 N개 담음 · 날짜"
└ span.resumeGo        "이어서 보기 →"
```

**v1은 메타 문구가 세 갈래였다.** 좁히기가 진행 중이면 남은 턴 수, 담은 게 있으면 담은 개수, 담은 게 0이면 생성된 개수. `.resume.inprog`가 첫 갈래의 테두리 강조다.

C5-S3의 미확정 항목 중 둘이 여기 대응한다. **담은 개수가 0일 때의 문구**와 **`generating` 세션을 어떻게 보일지**다. `SessionSummary.generating`이 그 신호를 이미 내준다.

**이것은 v1 기획이 아니라 v2 `tokens.css`에 지금 들어 있는 코드다.** v1 기획은 규칙이 아니지만(사용자 지시 2026-08-17), 저장소 안의 죽은 코드는 새 구현이 중복을 만들 대상이다. 되살릴지 지울지 새로 지을지는 S3가 정한다 — 모르고 새로 짓는 것만 피하면 된다.

문구 키는 넘어오지 않았으므로 어느 쪽을 고르든 `AUTHORED`에 새로 넣어야 한다(§8).

---

## 12. 유지

- 화면이나 요소를 더하거나 빼면 이 문서의 해당 표와 머리의 개수를 같은 커밋에서 고친다
- 부재 주장("없음", "미사용")은 grep 0건으로 확정하지 않는다. 그 값이 들어갈 수 있는 단위를 통째로 읽고 판정한다
- 요소 표는 나중에 검사 스크립트로 잠글 수 있다. 다만 오라클 없이 만든 스크립트는 이 저장소가 한 번 데인 방식이라, 표가 비판 라운드를 통과한 뒤에 만든다
