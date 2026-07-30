// @vock/tauri 공개 표면. 데스크톱 셸이 ShellDeps를 조립할 때 쓰는 플랫폼 어댑터(C4 S2).
// Tauri API를 아는 코드는 이 패키지에만 있다 — ui-shared·desktop 셸은 포트만 본다.
export { tauriTokenStore } from "./token-store.js";
export { tauriAuthFlow } from "./auth-flow.js";
