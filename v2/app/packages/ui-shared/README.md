# @vock/ui-shared

웹과 데스크톱이 공유하는 화면 계층. 플랫폼 API는 직접 부르지 않고 주입받는다(P3 UI 공유). `@vock/shared`에만 의존하며 프롬프트 문자열을 포함하지 않는다(SoT 8절, 게이트로 강제).

## 구조
```
src/
├ index.ts              공개 배럴
├ app/AppShell.tsx      반응형 셸. 넓은 화면은 사이드바와 본문 2열, 좁은 화면은 드로어
├ screens/EntryScreen.tsx  진입 화면(v1 마크업 이식)
├ i18n/strings.ts       UI 문구(v1 한국어 원문 그대로). 4개 언어 전량은 S5
├ i18n/examples.ts      예시 칩 풀(v1에서 verbatim 복사)
└ styles/
   ├ tokens.css         v1 theme.css를 한 글자도 바꾸지 않고 복사한 디자인 정본
   ├ shell.css          반응형 셸만 덮어쓰는 추가 레이어
   └ bundle.css         스타일 진입점(tokens 다음 shell)
```

## 디자인 원칙
- `tokens.css`는 v1 `theme.css`와 바이트 단위로 동일하다. 색, 타이포, 컴포넌트 클래스는 수정하지 않는다.
- 레이아웃 변경이 필요하면 `shell.css`에만 쓴다. 이 분리가 디자인 계승을 지키는 장치다.
