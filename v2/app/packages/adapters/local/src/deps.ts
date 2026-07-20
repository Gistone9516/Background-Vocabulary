// 부트 조립 팩토리. 포트 구현을 하나로 모아 주입한다(계층 분기의 유일 허용 지점, 코드규약 §3 팩토리).
// mock 계층 = 목 LLM(+DB 없음). local PG 계층 = 목 LLM + 실 PG 리포(C2.1).
// 실 LLM/검색/캐시(DeepSeek·Tavily·Upstash) 주입은 C2.4에서 확장한다.

import type { PipelineDeps, SqlRunner, AuthConfig, GoogleOAuthClient } from "@vock/shared";
import type { AppDeps } from "@vock/http-app";
import { buildRepositories, PgUserRepository, PgJtiBlacklist } from "@vock/persistence";
import { createAuthService } from "@vock/core";
import { MockLlmClient, MockSearchProvider, InMemoryCacheStore } from "./mocks/index.js";

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

// local 인증 계층: PG 리포 + 인증 서비스(주입된 GoogleOAuthClient는 로컬에선 목). CRUD는 JWT 경로.
export function buildLocalAuthDeps(sql: SqlRunner, config: AuthConfig, google: GoogleOAuthClient): AppDeps {
  const authService = createAuthService({
    users: new PgUserRepository(sql),
    blacklist: new PgJtiBlacklist(sql),
    google,
    config,
  });
  return { ...buildMockDeps(), repos: buildRepositories(sql), authService };
}
