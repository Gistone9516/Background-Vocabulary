// 실 local 계층 조립(§0-2 "local: .env 실키"). 실 DeepSeek·Tavily·Upstash + PG 리포 + 실 Google OAuth.
// Upstash 미설정이면 인메모리 캐시·카운터로 폴백(dev 편의). 실키 스모크는 핸즈온(키 보유 시).

import type { SqlRunner, AuthConfig } from "@vock/shared";
import type { AppDeps } from "@vock/http-app";
import { buildRepositories, PgUserRepository, PgJtiBlacklist } from "@vock/persistence";
import { createAuthService } from "@vock/core";
import { DeepSeekLlmClient, TavilySearchProvider, UpstashCacheStore, UpstashCounterStore, RealGoogleOAuthClient } from "@vock/providers";
import type { GoogleOAuthConfig } from "@vock/providers";
import { InMemoryCacheStore, InMemoryCounterStore } from "./mocks/index.js";

export interface LocalRealConfig {
  deepseekKey: string;
  tavilyKey: string;
  upstash?: { url: string; token: string };
  auth: AuthConfig;
  google: GoogleOAuthConfig;
}

export function buildLocalRealDeps(sql: SqlRunner, cfg: LocalRealConfig): AppDeps {
  const cache = cfg.upstash ? new UpstashCacheStore(cfg.upstash) : new InMemoryCacheStore();
  const counters = cfg.upstash ? new UpstashCounterStore(cfg.upstash) : new InMemoryCounterStore();
  const authService = createAuthService({
    users: new PgUserRepository(sql),
    blacklist: new PgJtiBlacklist(sql),
    google: new RealGoogleOAuthClient(cfg.google),
    config: cfg.auth,
  });
  return {
    llm: new DeepSeekLlmClient({ apiKey: cfg.deepseekKey }),
    search: new TavilySearchProvider({ apiKey: cfg.tavilyKey }),
    cache,
    repos: buildRepositories(sql),
    authService,
    counters,
  };
}
