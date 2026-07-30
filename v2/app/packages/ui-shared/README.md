# @vock/ui-shared

웹과 데스크톱이 공유하는 화면 계층. 플랫폼 API는 직접 부르지 않고 주입받는다(P3 UI 공유). `@vock/shared`에만 의존하며 프롬프트 문자열을 포함하지 않는다(SoT 8절, 게이트로 강제).

## 구조
```
src/
├ index.ts              공개 배럴
├ app/AppShell.tsx      반응형 셸. 넓은 화면은 사이드바와 본문 2열, 좁은 화면은 드로어
├ api/                  서버 통로. 포트와 fetch 구현, 에러 판별 유니온
│  ├ port.ts            ApiPort. 화면이 서버를 부르는 유일한 통로
│  ├ http-client.ts     fetch 구현(baseUrl·토큰·fetch 주입)
│  └ errors.ts          ApiError 분류. 상태 코드는 이 파일 밖으로 새지 않는다
├ screens/EntryScreen.tsx  진입 화면(v1 마크업 이식)
├ screens/narrow/       좁히기(아키네이터)
│  ├ machine.ts         전이 규칙. 네트워크도 DOM도 모르는 순수 함수
│  ├ decide.ts          종료 판정과 파생값(남은 턴은 저장하지 않고 계산)
│  ├ runner.ts          명령 실행과 요청 취소
│  ├ useNarrow.ts       React 배선
│  ├ NarrowScreen.tsx   질문 화면
│  └ HandoffScreen.tsx  S2 확인 화면(S3에서 난이도 화면이 대체, 참고용으로 남김)
├ screens/difficulty/   난이도 선택
│  ├ usePreview.ts      깊이별 예시 로딩. 요청 조립을 안에서 해 의존성을 원시값으로 묶는다
│  └ DifficultyScreen.tsx
└ screens/terms/        어휘 생성 스트리밍
   ├ machine.ts         전이 규칙. 누적 상한 검사가 여기 있다
   ├ runner.ts          스트림 구독과 취소, 감시 시계를 한 객체가 소유
   ├ useTerms.ts        React 배선
   ├ TermsScreen.tsx    카드 목록
   ├ detail-machine.ts  상세 열기·닫기·캐시 전이. 무료 열람 수는 클라가 세지 않는다
   ├ useDetail.ts       React 배선
   └ TermDetail.tsx     개념·내 상황·활용 3단과 출처
└ screens/kept/         담은 어휘
   ├ keep.ts            담긴 키 집합. 카드 원본은 건드리지 않는다
   ├ primer.ts          기본 정리(무비용, 서버 없이)
   └ KeptScreen.tsx     담은 목록과 붙여넣기용 정리
├ i18n/strings.ts       UI 문구(v1 한국어 원문 그대로). 4개 언어 전량은 S5
├ i18n/examples.ts      예시 칩 풀(v1에서 verbatim 복사)
├ app/journey.tsx       ★여정 배선(VockApp) — C4 S1에서 web/App.tsx를 승격. 화면·여정 변경은
│                        전부 이 파일에서 일어나 두 플랫폼에 같이 흐른다(C4 D-12)
├ app/shell-deps.ts     ShellDeps·ShellAuth 포트. 셸(web/desktop)이 구현해 VockApp에 넘긴다.
│                        auth=null이면 로그인 버튼이 뜨지 않는다(능력 강등, S5a A-2와 같은 경로)
├ app/sidebar-slots.tsx 사이드바 조립(구 web/Sidebar.tsx)
├ i18n/browser-locale-store.ts localStorage 로케일 저장소 — 웹뷰 두 플랫폼 공용
└ styles/
   ├ scale.css          가변 치수 스케일. 모든 길이의 기준을 이 파일에서만 정한다
   ├ vars.css           :root 디자인 토큰 변수만(라이트 + 다크). tokens.css가 @import한다
   ├ tokens.css         v1 theme.css에서 물려받은 디자인 정본(색, 타이포, 컴포넌트 클래스)
   ├ shell.css          반응형 셸만 덮어쓰는 추가 레이어
   └ bundle.css         스타일 진입점(scale, tokens, shell 순서)
```

## 밖으로 내보내는 진입점 두 개
`package.json`의 `exports`가 계약이다. **이름과 파일 이름을 같게 둔다** — 처음에 변수 진입점을
`./tokens.css`로 내보냈다가, 같은 폴더에 실재하는 다른 `tokens.css`(컴포넌트 스타일 540행)와
이름이 겹쳐 한 이름이 두 가지를 뜻하게 됐다.

| 진입점 | 대상 | 쓰는 곳 |
|---|---|---|
| `@vock/ui-shared/styles.css` | `bundle.css` (scale + tokens + shell 전부) | 앱(`web/main.tsx`). `web/vite.config.ts`가 alias로 직접 매핑하므로 exports 맵을 거치지 않는다 |
| `@vock/ui-shared/vars.css` | `vars.css` (`:root` 변수만) | 랜딩(`packages/landing`). 랜딩은 계약상 디자인 토큰만 공유한다(S6 L-2·L-2b) |

`styles.css`를 랜딩이 가져오면 `boundary-check.mjs`가 막는다. 그 파일은 요소 스타일까지 담고 있어서
독립 페이지의 레이아웃을 조용히 앱 것으로 바꾼다 — 화면이 그럴듯하게 망가지므로 실측으로만 잡힌다.

## 디자인 원칙
- 색, 타이포 위계, 컴포넌트 클래스, 애니메이션은 v1에서 그대로 물려받는다. 수정하지 않는다.
- 글자 크기는 창 크기에 반응하지 않는다. 브라우저 확대 축소와 사용자의 글자 크기 설정에만 반응하도록 rem으로 적는다.
- 창 크기에 반응하는 것은 레이아웃뿐이다. 열 폭이나 사이드바처럼 공간을 나누는 값에만 vw와 vh를 쓴다.
- 길이의 기준값은 `scale.css` 한 곳에만 둔다. 개별 파일에서 새 기준을 만들지 않는다.
- px로 남기는 것은 키우면 오히려 나빠지는 값뿐이다. 얇은 경계선, 초점 테두리, 스크롤바 폭, 밑줄 두께가 그렇다.
- 레이아웃 변경이 필요하면 `shell.css`에만 쓴다. 이 분리가 디자인 계승을 지키는 장치다.

### v1 대비 이력
2026-07-28에 길이 단위를 정리하면서 `tokens.css`의 v1 바이트 동일성은 끝났다. 바뀐 것은 단위뿐이고 값은 그대로다. 브라우저 기본 설정에서 rem 값은 v1의 px 값과 정확히 일치한다. 정리 범위는 현재 화면에 렌더되는 부분(진입 화면, 오로라, 셸)이고 나머지 화면은 각 슬라이스에서 같은 규칙으로 옮긴다.
