// 어휘 생성 화면의 공개 표면.
export { TermsScreen, type TermsScreenProps } from "./TermsScreen.js";
export { TermDetail, type TermDetailProps } from "./TermDetail.js";
export { useDetail } from "./useDetail.js";
export { reduce as reduceDetail, initialDetail } from "./detail-machine.js";
export type { DetailCache, DetailCmd, DetailEvent, DetailState } from "./detail-machine.js";
export { useTerms, type UseTermsOptions } from "./useTerms.js";
export { TermsRunner, type TermsEffects } from "./runner.js";
export { reduce, initialTerms, termsOf, isStreaming } from "./machine.js";
export { HIGH_RISK_CODE } from "./types.js";
export type { SettleReason, TermCard, TermsCmd, TermsConfig, TermsEvent, TermsState } from "./types.js";
