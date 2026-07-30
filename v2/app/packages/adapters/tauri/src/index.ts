// @vock/tauri 공개 표면. 데스크톱 셸이 ShellDeps를 조립할 때 쓰는 플랫폼 어댑터(C4 S2).
// Tauri API를 아는 코드는 이 패키지에만 있다 — ui-shared·desktop 셸은 포트만 본다.
export { tauriTokenStore } from "./token-store.js";
export { tauriAuthFlow } from "./auth-flow.js";
export { tauriOfflineStore } from "./offline-store.js";
// 퀵 캡처(FR-903)는 JS가 아니라 src-tauri(lib.rs)에 있다 — 최소화된 웹뷰는 스로틀링돼
// 이벤트가 유실된다(실측). 여기에는 그 흔적만 남긴다.
