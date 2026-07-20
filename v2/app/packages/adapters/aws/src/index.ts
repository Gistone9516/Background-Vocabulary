// @vock/aws 공개 표면. Lambda 핸들러(handler.ts)는 진입점이라 배럴에서 재노출하지 않는다
// (top-level await 초기화가 import 시 실행되지 않도록). Lambda 설정의 핸들러 = dist/handler.handler.
export { buildAwsDeps } from "./deps.js";
export type { AwsConfig } from "./deps.js";
export { DataApiSqlRunner } from "./data-api-runner.js";
export type { DataApiConfig } from "./data-api-runner.js";
export { loadSecrets } from "./secrets.js";
export type { VockSecrets } from "./secrets.js";
