// @vock/ui-shared 공개 표면. 화면과 셸, 문구, 서버 통로를 노출한다.
// 스타일은 패키지 exports의 ./styles.css 로 별도 임포트한다(번들러가 처리).
export { AppShell } from "./app/AppShell.js";
export type { AppShellProps } from "./app/AppShell.js";
export { SessionList } from "./app/SessionList.js";
export type { SessionListProps } from "./app/SessionList.js";
export { ProjectList } from "./app/ProjectList.js";
export type { ProjectListProps } from "./app/ProjectList.js";

// 세션 서버 동기화(S5). 저장 시점은 좁히기·생성 상태 기계가 이미 정한다.
export { toSnapshot, fromSnapshot, toSessionRec, resumeTarget, useSessionSync, useProjects } from "./session/index.js";
export type { Resume, SnapshotArgs, SessionListState, UseSessionSyncOptions, UseProjectsOptions } from "./session/index.js";
export { EntryScreen } from "./screens/EntryScreen.js";
export type { EntryScreenProps } from "./screens/EntryScreen.js";
// 문구. 컴포넌트는 useTr()로, React 밖은 trIn(locale, key)로 쓴다. ko 전용 함수는 없다 —
// 있으면 로케일을 안 넘긴 호출부가 조용히 한국어를 띄운다(S-32와 같은 이유).
export { trIn, STRINGS } from "./i18n/strings.js";
export type { StringKey } from "./i18n/strings.js";
export { AI_AUTHORED } from "./i18n/strings.origin.js";
export { EXAMPLES, pickRandom } from "./i18n/examples.js";

// 출력 로케일(S5-3). 정본은 주입된 저장소이고 화면과 요청이 같은 값을 본다.
export { LocaleProvider, useOutputLocale, useTr, asOutputLocale, LOCALE_LABELS } from "./i18n/locale.js";
export type { LocaleStore, LocaleProviderProps } from "./i18n/locale.js";
export { LangSelect } from "./app/LangSelect.js";

// 서버 통로. 구현은 셸(web/desktop)이 만들어 주입한다.
export type { ApiPort, AuthPort, AuthSession, TokenStore, StoredTokens } from "./api/index.js";
export { HttpApiClient, classifyResponse, isRetryable, isApiError, memoryTokenStore, limitsFor, FALLBACK_LIMITS } from "./api/index.js";
export type { TierLimits } from "./api/index.js";
export type { ApiError, HttpApiConfig, KeepBody, ListSessionsArgs } from "./api/index.js";

// 로그인(S5a). 로그인은 관문이 아니다. 비로그인으로도 전 여정이 돈다.
export { AuthButton, useAuth, preparePkce, challengeOf, buildAuthorizeUrl, readCallback } from "./screens/auth/index.js";
export type { AuthButtonProps, AuthState, AuthUser, UseAuthOptions, PkcePrep } from "./screens/auth/index.js";

// 좁히기. 상태 기계는 React와 무관한 순수 로직이라 게이트가 서버 없이 검증한다.
export { NarrowScreen, useNarrow } from "./screens/narrow/index.js";
export type { NarrowScreenProps, UseNarrowOptions } from "./screens/narrow/index.js";
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

// 담기와 담은 어휘(S4).
export {
  KeptScreen,
  normTerm,
  isKept,
  toggleKeep,
  keptList,
  emptyKept,
  buildBasicPrimer,
  buildPrimerText,
  primerBody,
  primerFailure,
  primerKey,
  usePrimer,
} from "./screens/kept/index.js";
export type { KeptScreenProps, KeptMap, PrimerState } from "./screens/kept/index.js";

// 난이도 선택과 어휘 생성(S3).
export { DifficultyScreen, usePreview, pickedLabels, previewKeyOf, sameKey } from "./screens/difficulty/index.js";
export type { DifficultyScreenProps, Difficulty, PreviewKey, PreviewState } from "./screens/difficulty/index.js";
export {
  TermsScreen,
  TermDetail,
  detailInputOf,
  useTerms,
  useDetail,
  TermsRunner,
  reduce as reduceTerms,
  reduceDetail,
  initialTerms,
  initialDetail,
  termsOf,
  isStreaming,
  HIGH_RISK_CODE,
} from "./screens/terms/index.js";
export type {
  TermsScreenProps,
  TermDetailProps,
  UseTermsOptions,
  TermsEffects,
  SettleReason,
  TermCard,
  TermsCmd,
  TermsConfig,
  TermsEvent,
  TermsState,
  DetailCache,
  DetailCmd,
  DetailEvent,
  DetailState,
} from "./screens/terms/index.js";
