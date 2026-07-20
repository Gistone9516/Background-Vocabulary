// @vock/local 공개 표면. 부트와 mock 조립 팩토리.
export { bootLocal } from "./boot.js";
export type { BootOptions, BootHandle } from "./boot.js";
export { buildMockDeps } from "./deps.js";
export { MockLlmClient, MockSearchProvider, InMemoryCacheStore } from "./mocks/index.js";
