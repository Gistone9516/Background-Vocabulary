// Hono 앱 조립. 주입된 포트(PipelineDeps)로 파이프라인을 만들고 라우트를 등록한다.
// 부트(서버 기동)는 여기 없다 — 계층별 부트(local·aws)가 이 앱을 감싼다.

import { Hono } from "hono";
import { createPipeline } from "@vock/core";
import type { AuthService } from "@vock/core";
import { DEFAULT_LIMITS } from "@vock/shared";
import type { PipelineDeps, ClientLimits, Limits, Repositories, CounterStore, Tier } from "@vock/shared";
import { registerPipelineRoutes } from "./routes/pipeline-routes.js";
import { registerCrudRoutes } from "./routes/crud-routes.js";
import { registerAuthRoutes } from "./routes/auth-routes.js";
import { jwtResolveUserId, devResolveUserId } from "./middleware/auth.js";
import { installGating } from "./middleware/gating.js";

// 앱 의존 계약. 부트가 계층별로 조립해 주입한다.
// repos 미주입(mock UI 부트)=CRUD 미등록. authService 미주입=/auth 미등록+CRUD는 DEV(x-user-id).
// counters 미주입=게이팅 미적용(mock UI 부트). 주입 시 비용 엔드포인트에 §4 게이팅 적용.
export interface AppDeps extends PipelineDeps {
  repos?: Repositories;
  authService?: AuthService;
  counters?: CounterStore;
}

// 운영 한도에서 클라이언트 게이팅용 부분집합(/config 응답)을 파생한다.
function toClientLimits(l: Limits): ClientLimits {
  return {
    narrowMax: l.narrowMax,
    detailLimitFree: l.detailLimitFree,
    freeWeeklyLimit: l.freeWeeklyLimit,
    maxTotal: l.maxTotal,
    groupGen: l.groupGen,
    maxContextChars: l.maxContextChars,
  };
}

export function createApp(deps: AppDeps): Hono {
  const pipeline = createPipeline(deps);
  const clientLimits = toClientLimits(deps.limits ?? DEFAULT_LIMITS);

  const app = new Hono();
  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/config", (c) => c.json(clientLimits));

  // 게이팅은 라우트 등록 전에 install해야 핸들러보다 먼저 돈다(§4).
  if (deps.counters) {
    const authService = deps.authService;
    const resolveIdentity = authService
      ? async (b: string | null): Promise<{ tier: Tier; userId: string | null }> => {
          const claims = b ? await authService.verifyAccessToken(b) : null;
          return claims ? { tier: claims.tier, userId: claims.sub } : { tier: "free", userId: null };
        }
      : async (): Promise<{ tier: Tier; userId: string | null }> => ({ tier: "free", userId: null });
    installGating(app, { counters: deps.counters, limits: deps.limits ?? DEFAULT_LIMITS, resolveIdentity });
  }

  registerPipelineRoutes(app, pipeline);
  if (deps.authService) registerAuthRoutes(app, deps.authService);
  const resolveUserId = deps.authService ? jwtResolveUserId(deps.authService) : devResolveUserId();
  if (deps.repos) registerCrudRoutes(app, deps.repos, resolveUserId);
  return app;
}
