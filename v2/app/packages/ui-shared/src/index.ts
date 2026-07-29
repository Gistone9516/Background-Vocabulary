// @vock/ui-shared 공개 표면. 화면과 셸, 문구, 서버 통로를 노출한다.
// 스타일은 패키지 exports의 ./styles.css 로 별도 임포트한다(번들러가 처리).
export { AppShell } from "./app/AppShell.js";
export type { AppShellProps } from "./app/AppShell.js";
export { EntryScreen } from "./screens/EntryScreen.js";
export type { EntryScreenProps } from "./screens/EntryScreen.js";
export { tr } from "./i18n/strings.js";
export type { StringKey } from "./i18n/strings.js";
export { EXAMPLES, pickRandom } from "./i18n/examples.js";

// 서버 통로. 구현은 셸(web/desktop)이 만들어 주입한다.
export type { ApiPort } from "./api/index.js";
export { HttpApiClient, classifyResponse, isRetryable, isApiError } from "./api/index.js";
export type { ApiError, HttpApiConfig } from "./api/index.js";

// 좁히기. 상태 기계는 React와 무관한 순수 로직이라 게이트가 서버 없이 검증한다.
export { NarrowScreen, HandoffScreen, useNarrow } from "./screens/narrow/index.js";
export type { NarrowScreenProps, HandoffScreenProps, UseNarrowOptions } from "./screens/narrow/index.js";
export {
  reduce as reduceNarrow,
  initialNarrow,
  answeredCount,
  decideNext,
  isUsableQuestion,
  realAnswers,
  turnsLeft,
  EMPTY_PICKS,
} from "./screens/narrow/index.js";
export type {
  AnswerTurn,
  DoneReason,
  NarrowCmd,
  NarrowConfig,
  NarrowCtx,
  NarrowEvent,
  NarrowState,
  Picks,
  Question,
  RetryOf,
} from "./screens/narrow/index.js";

// 난이도 선택과 어휘 생성(S3).
export { DifficultyScreen, usePreview, pickedLabels, previewKeyOf, sameKey } from "./screens/difficulty/index.js";
export type { DifficultyScreenProps, Difficulty, PreviewKey, PreviewState } from "./screens/difficulty/index.js";
export { TermsScreen, useTerms, TermsRunner, reduce as reduceTerms, initialTerms, termsOf, isStreaming, HIGH_RISK_CODE } from "./screens/terms/index.js";
export type {
  TermsScreenProps,
  UseTermsOptions,
  TermsEffects,
  SettleReason,
  TermCard,
  TermsCmd,
  TermsConfig,
  TermsEvent,
  TermsState,
} from "./screens/terms/index.js";
