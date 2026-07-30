# app/journey.tsx — 판단 기록

**정본** = `v2/app/packages/ui-shared/src/app/journey.tsx`. 경로는 리포 루트 기준, 명령은 `v2/app`에서.
규칙 원문 → `v2/docs/specs/C4-데스크톱.md`(D-1·D-12), `C4-S1-셸기동.md`(DS-2·DS-4), ADR-004(P3).

등급: `[실행]` 실행 출력 / `[코드]` 코드를 읽었음 / `[대화]` 인용 가능한 사용자 발언 / `[문서]` 문서 하나 / `[미검증]`.

---

## 판단 1 — 여정 배선을 web에서 ui-shared로 올렸다. 다른 길이 없었다

**결정.** `web/src/App.tsx`(292행)의 `AppBody`·`doneNotice`가 이 파일로, `Sidebar.tsx`가
`sidebar-slots.tsx`로, `ShellDeps` 타입이 `shell-deps.ts`로 올라왔다. 공개 이름은 `VockApp`.
web에 남은 것은 `main.tsx`(마운트)·`deps.ts`(플랫폼 조립)·`auth-storage.ts`(웹 전용 토큰 저장)뿐이다.

**왜 이동이 강제였나.** `web/deps.ts:2`의 약속("데스크톱 셸은 App.tsx를 그대로 두고 이 파일만
바꿔 끼운다")은 App.tsx가 web 안에 있는 한 **성립 불가능**했다 — 형제 참조(`desktop → web`)는
경계 게이트가 막고 `[실행]`(음성 확인: desktop이 `@vock/core`를 import하자 실패), 복사하면 여정이
두 벌이 되어 D-12(기획 동일선상, 사용자 지시 `[대화]`: "웹페이지와 데스크톱 앱의 기획은 동일선상에서
수정되어야 해")가 코드 차원에서 깨진다.

**이동이지 수정이 아니다(DS-2).** 바뀐 것은 두 가지뿐: ① import가 배럴에서 상대경로로
② redirectUri 인라인 계산(`location.origin + location.pathname`)이 `deps.auth`로. 나머지 줄은
App.tsx 그대로다. 이동 후 web을 빌드해 실화면으로 확인했다 `[실행]` — 진입 화면·사이드바·언어
선택 모두 이전과 동일, CSS 번들 해시도 동일(`index-CTGwNO9F.css`).

**뒤집으면 깨지는 것.** "여정은 앱(web)의 것"이라는 직관이 되돌리는 이유가 된다. 되돌리면
desktop이 여정을 복사해야 하고, 그 복사본은 컴파일이 계속 되므로 **갈라져도 아무 게이트가 못
잡는다** — 두 플랫폼의 여정이 조용히 달라지는 것이 D-12가 막으려는 정확히 그 상태다.

## 판단 2 — redirectUri를 ShellAuth 능력으로 바꿨다 (이동 중 유일한 의미 변경)

**결정.** `ShellDeps.auth: { redirectUri(): string } | null`. `null`이면 `clientId`를 죽여
로그인 버튼이 뜨지 않는다 — client_id 미등록 시 버튼이 없는 것(S5a A-2)과 **같은 강등 경로**를
태운다. 새 분기를 만들지 않았다.

**왜.** 원래 코드는 `typeof location === "undefined" ? "" : location.origin + location.pathname`
`[코드]` — 웹의 자기 오리진 콜백 전제가 여정 안에 박혀 있었다. Tauri 웹뷰에도 `location`은
있으므로 이 코드는 **그럴듯한 잘못된 값**(`http://localhost:5185/` 등)을 만든다 — 죽지 않고
잘못 동작하는 종류다. 능력을 선언하는 쪽(셸)이 값도 주게 바꿨다. 데스크톱 S1은 `null`이고,
S2가 시스템 브라우저+루프백(계약 §140)으로 채운다.

**뒤집으면 깨지는 것.** "redirectUri는 어차피 location으로 만들 수 있다"며 인라인으로 되돌리면,
데스크톱에서 로그인 버튼이 뜨고 눌리고 **Google까지 갔다가 콜백에서 죽는다.** 버튼이 안 뜨는
것과 눌렀는데 죽는 것은 다른 실패다 — 전자만이 강등이다.

## 판단 3 — browserLocaleStore도 승격, localTokenStore는 web에 남김

로케일 저장소는 웹뷰 두 플랫폼이 같은 localStorage 구현을 쓴다(두 벌이면 키가 갈라진다.
`memoryTokenStore`가 ui-shared에 있는 선례). 토큰 저장소는 **일부러 남겼다** — web의 구현은
"refresh 토큰이 localStorage에 있다"는 웹 전용 타협을 자기 주석으로 지고 있고 `[코드]`,
데스크톱은 그 타협을 물려받으면 안 된다(D-5, S2에서 OS 보안 저장소). 공유하면 타협도 공유된다.

## 그때 무엇을 근거로 삼았나 — 자기 신고, `[미검증]`

- **읽은 것** — App.tsx·Sidebar.tsx·deps.ts·main.tsx·양 저장소·web tsconfig/package.json 전문,
  ui-shared 배럴 전문.
- **안 읽은 것** — 옮겨 온 훅들의 본문(useNarrow·useTerms 등). 이동이므로 내용을 안 바꿨고,
  타입 검사와 web 실화면으로 결과만 확인했다.
- **브리핑** — C4 착수 시 현장·주변 2대. 주변 렌즈가 이 이동의 전제(§1 "웹이 유일한 플랫폼"
  가정 목록, `App.tsx:97`의 redirectUri 포함)를 보고했다.
- **실행으로 확인한 것** — tsc 3면 통과, 게이트 음성 3종(타입 오류·경계·프롬프트 토큰 전부 실패
  확인), D-3 빌드 가드 음성·양성, web 실화면.
- **위치** — C4 S1, desktop 패키지 신설과 같은 커밋.

## 이 노트가 낡는 조건

- ~~S2가 데스크톱 로그인을 붙이면 … 포트를 넓힐 것~~ → **발동·해소(C4 S2, 2026-07-30).**
  예고된 방향 그대로 풀렸다: `ShellAuth`가 `AuthFlow`(platform·redirectUri·navigate·
  waitForCallback)로 넓어졌고 여정에는 분기가 없다. 상세는
  `_shadow/…/screens/auth/useAuth.ts.md`. S2는 여정에 locale 동기화 effect도 더했다(FR-952,
  정본=서버) — 이것은 화면 분기가 아니라 플랫폼 무관 로직이라 여정에 두는 것이 맞다.
- **화면·여정을 바꾸는 모든 후속 작업**은 이 파일에서 일어난다(D-12). web이나 desktop 쪽에서
  여정을 고치고 싶어지면 그것이 바로 이 구조가 막는 상태다.
- **`sidebarSlots`가 플랫폼별로 달라지고 싶어지면**(예: 데스크톱 전용 메뉴) 화면 분기가 아니라
  슬롯 주입으로 풀 것 — AppShell은 이미 슬롯을 받는 구조다.
