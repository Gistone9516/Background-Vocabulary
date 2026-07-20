// 부트 조립 팩토리(mock 계층). 포트 구현을 하나로 모아 PipelineDeps로 주입한다.
// 계층 분기의 유일 허용 지점(코드규약 §3 팩토리). limits 미지정 시 core가 DEFAULT_LIMITS를 쓴다.
// 실 local 계층(node-postgres 리포·Upstash·DeepSeek 실키)은 C2에서 buildLocalDeps로 추가한다.

import type { PipelineDeps } from "@vock/shared";
import { MockLlmClient, MockSearchProvider, InMemoryCacheStore } from "./mocks/index.js";

export function buildMockDeps(): PipelineDeps {
  return {
    llm: new MockLlmClient(),
    search: new MockSearchProvider(),
    cache: new InMemoryCacheStore(),
  };
}
