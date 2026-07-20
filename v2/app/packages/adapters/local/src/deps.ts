// 부트 조립 팩토리. 포트 구현을 하나로 모아 주입한다(계층 분기의 유일 허용 지점, 코드규약 §3 팩토리).
// mock 계층 = 목 LLM(+DB 없음). local PG 계층 = 목 LLM + 실 PG 리포(C2.1).
// 실 LLM/검색/캐시(DeepSeek·Tavily·Upstash) 주입은 C2.4에서 확장한다.

import type { PipelineDeps, SqlRunner, AuthConfig, GoogleOAuthClient, Limits } from "@vock/shared";
import type { AppDeps } from "@vock/http-app";
import { buildRepositories, PgUserRepository, PgJtiBlacklist } from "@vock/persistence";
import { createAuthService } from "@vock/core";
import { MockLlmClient, MockSearchProvider, InMemoryCacheStore, InMemoryCounterStore } from "./mocks/index.js";

export function buildMockDeps(): PipelineDeps {
  return {
    llm: new MockLlmClient(),
    search: new MockSearchProvider(),
    cache: new InMemoryCacheStore(),
  };
}

// local PG 계층: 목 파이프라인 포트 + 실 PG 리포. CRUD는 DEV(x-user-id) 경로.
export function buildLocalPgDeps(sql: SqlRunner): AppDeps {
  return { ...buildMockDeps(), repos: buildRepositories(sql) };
}

// local 인증+게이팅 계층: PG 리포 + 인증 서비스 + 인메모리 카운터. CRUD는 JWT, 비용 엔드포인트는 §4 게이팅.
// opts.limits로 게이팅 한도를 조정할 수 있다(e2e에서 소한도 검증).
export function buildLocalAuthDeps(sql: SqlRunner, config: AuthConfig, google: GoogleOAuthClient, opts: { limits?: Limits } = {}): AppDeps {
  const authService = createAuthService({
    users: new PgUserRepository(sql),
    blacklist: new PgJtiBlacklist(sql),
    google,
    config,
  });
  const deps: AppDeps = { ...buildMockDeps(), repos: buildRepositories(sql), authService, counters: new InMemoryCounterStore() };
  return opts.limits ? { ...deps, limits: opts.limits } : deps;
}
