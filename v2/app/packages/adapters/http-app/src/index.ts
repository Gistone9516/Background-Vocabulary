// @vock/http-app 공개 표면. 계층별 부트가 이 팩토리로 앱을 조립한다.
export { createApp } from "./app.js";
export type { AppDeps } from "./app.js";
// 게이트가 절단을 직접 검증한다(C4 S4 — 목 LLM은 입력을 무시해 응답으로는 관찰 불가).
export { clampContext } from "./routes/pipeline-routes.js";
