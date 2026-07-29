// 세션 서버 동기화의 공개 표면. 변환은 순수 함수라 게이트가 서버 없이 검증한다.
export { toSnapshot, fromSnapshot, toSessionRec, type SnapshotArgs } from "./snapshot.js";
export { resumeTarget, type Resume } from "./resume.js";
export { useSessionSync, type SessionListState, type UseSessionSyncOptions } from "./useSessionSync.js";
