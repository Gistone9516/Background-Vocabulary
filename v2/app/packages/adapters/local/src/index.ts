// @vock/local 공개 표면. 부트와 조립 팩토리, PG 드라이버, 마이그레이션.
export { bootLocal } from "./boot.js";
export type { BootOptions, BootHandle } from "./boot.js";
export { buildMockDeps, buildLocalPgDeps, buildLocalAuthDeps } from "./deps.js";
export { PgSqlRunner, createPgPool } from "./pg-runner.js";
export { migrate } from "@vock/persistence";
export { MockLlmClient, MockSearchProvider, InMemoryCacheStore, MockGoogleOAuthClient } from "./mocks/index.js";
