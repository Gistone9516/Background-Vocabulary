// aws 부트 조립 팩토리. DataApiSqlRunner + 실 공급자 + Secrets로 AppDeps를 만든다.
// ★ 배포 게이트 코드 — 로컬 스모크 불가. 서버리스라 캐시·카운터는 Upstash 필수(인메모리 폴백 없음).

import { DataApiSqlRunner, type DataApiConfig } from "./data-api-runner.js";
import { buildRepositories, PgUserRepository, PgJtiBlacklist } from "@vock/persistence";
import { createAuthService } from "@vock/core";
import { DeepSeekLlmClient, TavilySearchProvider, UpstashCacheStore, UpstashCounterStore, RealGoogleOAuthClient } from "@vock/providers";
import type { AppDeps } from "@vock/http-app";
import type { VockSecrets } from "./secrets.js";

export interface AwsConfig {
  dataApi: DataApiConfig;
  region?: string;
  secrets: VockSecrets;
}

export function buildAwsDeps(cfg: AwsConfig): AppDeps {
  const sql = new DataApiSqlRunner(cfg.dataApi, cfg.region);
  const s = cfg.secrets;
  const authService = createAuthService({
    users: new PgUserRepository(sql),
    blacklist: new PgJtiBlacklist(sql),
    google: new RealGoogleOAuthClient(s.google),
    config: { jwtSecretCurrent: s.jwtSecretCurrent, jwtKid: s.jwtKid, ...(s.jwtSecretPrev ? { jwtSecretPrev: s.jwtSecretPrev } : {}) },
  });
  return {
    llm: new DeepSeekLlmClient({ apiKey: s.deepseekKey }),
    search: new TavilySearchProvider({ apiKey: s.tavilyKey }),
    cache: new UpstashCacheStore(s.upstash),
    repos: buildRepositories(sql),
    authService,
    counters: new UpstashCounterStore(s.upstash),
  };
}
