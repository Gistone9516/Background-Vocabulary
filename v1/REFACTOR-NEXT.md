# 리팩토링 후속 계획 (branch `refactor/sidepanel-decompose`)

> 야간 자율 작업으로 **foundation 분해까지 완료·검증·커밋**(`9083efc`). 이 문서는 남은 분해의 실행 계획이다. 남은 단계는 **런타임 동작이 바뀔 수 있어 시각/라이브 검증이 필요**하므로 야간 자율로 강행하지 않고 여기에 계획으로 둔다(브랜치는 그대로, 사용자가 5180에서 확인하며 이어가면 됨).

## 완료(이 브랜치, 검증됨)
App.tsx(904→785줄)에서 순수 모듈 분리(코드 이동만, 로직 무변경):
- `types.ts`(Screen·UITerm·Q·State·Action) · `constants.ts`(MIN_Q·THINK_KEYS·HIGHRISK·LOCALE_TAG·GALAXY_POS) · `text.tsx`(sentLines·splitSentences·firstSentence·fmtDate·markTerms·commaLines) · `file.ts`(isTextFile·readTextFile) · `icons.tsx`(13 아이콘). `mock.ts`의 HIGHRISK도 constants로 단일화.
- 검증: 확장 tsc 클린 + vite build + 이식성 가드 PASS. theme.css·i18n·계약 무변경.

## 불변 경계(모든 후속 단계 공통, 절대 변경 금지)
- 프론트↔백 계약(`shared/types`·`prompts`·`interfaces`·`pipeline.stub`), 5 엔드포인트 시그니처(`api.ts`).
- 이식성(`core/`·`shared/` 런타임 누수 0, `npm run guard`).
- `theme.css`(프로토타입 verbatim) · i18n 키 · localStorage 키(`sidetab:plan/locale/tutorial-seen`, `sidetab:sessions`, `userId`).
- 5화면 + paywall/refusal 동작, 스트리밍/Abort, 무료/유료 게이팅, 튜토리얼 1회.

## 남은 단계 (위험 낮은 순)

### 1. 화면 컴포넌트 분리 `screens/` — 위험 낮음(기계적, tsc로 검증), 효과 큼
App.tsx의 화면 함수를 파일로 이동(현재 props·동작 그대로). 각 파일은 `types`·`text`·`icons`·`i18n`(tr)·하위 컴포넌트를 import.
- `screens/Header.tsx` · `Entry.tsx` · `Narrow.tsx` · `Detail.tsx` · `Card.tsx`(Detail 사용) · `Terms.tsx`(Card 사용) · `Kept.tsx`(Card 사용) · `Paywall.tsx` · `Refusal.tsx` · `Tutorial.tsx`.
- App.tsx는 이들을 import하고 함수 정의 제거 → App.tsx ~300줄로 축소(가장 큰 가시 효과).
- 주의: props 시그니처를 그대로 유지(핸들러 타입은 `types.ts`/인라인). 순환참조 없게 Card↔Detail은 같은 파일 또는 Detail을 Card가 import.
- 검증: 확장 tsc 클린 + vite build + **5180에서 5화면 시각 확인**.

### 2. 커스텀 훅 `hooks/` — 위험 중(이펙트·클로저 의미 보존이 관건)
App 본문의 로직 덩어리를 훅으로. **이펙트 타이밍·의존성 배열·sref(stale closure) 동작을 그대로 보존**해야 함(여기서 회귀가 가장 잘 생김 → 라이브 검증 필수).
- `useThinkingTick`(Narrow의 4초 로딩 문구 인터벌) · `useAutoGrow`(textarea 높이) — 가장 독립적, 먼저.
- `useNarrowingFlow`(startNarrow·advanceNarrow·nextStep·undoStep·refineFromTerms·toggleSel) · `useStreamRecommend`(runRecommend·loadMore·genGroup·buildRecInput·abortRef) · `useDetailModal`(toggleDetail·jumpRelated) · `useKeepingSession`(persist·toggleKeep·openHistory·buildSummary·onCopy·onShare·aiRefine).
- `usePersistence`(localStorage 래퍼: plan·locale·tutorial-seen, try/catch 일원화) · `usePlan`(isPro) · `useConfig`(getConfig).
- 검증: 단계마다 5180에서 **해당 플로 전수 클릭**(다중선택·직접입력·어려워요·되돌리기·더보기·그룹·재탐색·상세·담기·복사·AI정리·페이월·튜토리얼·로케일전환) — 헤드리스로는 안 잡히는 회귀가 있으니 라이브 필수.

### 3. 서비스 레이어 `services/` — 위험 중
api 호출 오케스트레이션을 UI 사이드이펙트와 분리(narrowService·termService). 핸들러는 글루로. 훅 단계와 함께/직후.

### 4. Context 도입 — 위험 중상(렌더·prop-drilling 구조 변경)
`StateContext`+`ActionContext`로 화면에 state·merge·핸들러 직주입 폐지. 렌더 결과 동치 확인.

### 5. 메모/정리·스타일 합치기 — 위험 낮음
`React.memo`(스크린·Card·Detail), 죽은 코드 제거, 반복 정적 인라인스타일만 신규 css(값 동일, theme.css 무변경). 시각 변동 0 확인.

### 6. 백엔드 소폭(계약·이식성 불변 내) — 위험 낮음
`core/pipeline.ts`·`adapters/workers`의 `siteFromUrl` 중복 → `shared/utils` 단일화, 긴 함수/중복 정리(buildLimits 범위검증·rateLimit 미들웨어화 등 계약 무변경분).

## 권장 진행
1단계(화면) → 라이브 검증 → 커밋. 2단계 이후는 각 단계마다 라이브 검증+커밋(회귀 시 단계 단위 롤백). 모두 끝나면 master 머지. 헤드리스 테스트(jsdom+testing-library)를 먼저 구축하면 1차 안전망이 되나, **최종 신뢰는 5180 시각 확인**.

## 참고 — App.tsx 현재 구조 맵
App 본문(useReducer+sref+merge, 핸들러 ~30개, useEffect 5개, 렌더) → 화면 함수(Header·Entry·Narrow·Detail·Card·Terms·Kept·Paywall·Refusal·Tutorial) → `msg()`. 핸들러는 위 훅 그룹으로 매핑됨.
