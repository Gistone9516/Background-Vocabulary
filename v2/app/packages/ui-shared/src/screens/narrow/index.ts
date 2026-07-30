// 좁히기 화면의 공개 표면.
export { NarrowScreen, type NarrowScreenProps } from "./NarrowScreen.js";
export { useNarrow, type UseNarrowOptions } from "./useNarrow.js";
export { NarrowRunner, type NarrowEffects } from "./runner.js";
export { reduce, initialNarrow, answeredCount } from "./machine.js";
export { decideNext, isUsableQuestion, realAnswers, turnsLeft, type Decision } from "./decide.js";
export { EMPTY_PICKS } from "./types.js";
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
} from "./types.js";
