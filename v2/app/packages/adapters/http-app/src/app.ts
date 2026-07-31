// Hono 앱 조립. 주입된 포트(PipelineDeps)로 파이프라인을 만들고 라우트를 등록한다.
// 부트(서버 기동)는 여기 없다 — 계층별 부트(local·aws)가 이 앱을 감싼다.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { createPipeline } from "@vock/core";
import type { AuthService } from "@vock/core";
import { DEFAULT_LIMITS } from "@vock/shared";
import type { PipelineDeps, ClientLimits, Limits, Repositories, CounterStore, Tier } from "@vock/shared";
import { registerPipelineRoutes } from "./routes/pipeline-routes.js";
import { registerCrudRoutes } from "./routes/crud-routes.js";
import { registerAuthRoutes } from "./routes/auth-routes.js";
import { jwtResolveUserId, devResolveUserId } from "./middleware/auth.js";
import { installGating } from "./middleware/gating.js";
import { installClientCheck, type ClientCheckConfig } from "./middleware/client-check.js";
import { buildDetailCache } from "./detail-cache.js";

// 앱 의존 계약. 부트가 계층별로 조립해 주입한다.
// repos 미주입(mock UI 부트)=CRUD 미등록. authService 미주입=/auth 미등록+CRUD는 DEV(x-user-id).
// counters 미주입=게이팅 미적용(mock UI 부트). 주입 시 비용 엔드포인트에 §4 게이팅 적용.
export interface AppDeps extends PipelineDeps {
  repos?: Repositories;
  authService?: AuthService;
  counters?: CounterStore;
  // 구글 OAuth 클라이언트 식별자. 부트가 env에서 읽어 넣는다.
  // 운영 한도가 아니라 클라이언트 설정이라 Limits가 아니라 여기로 받는다.
  googleClientId?: string;
  // CORS 허용 오리진(C4 S2 DS2-1). 미설정 = 미들웨어 자체가 안 붙는다 — 웹 단일 오리진
  // 배포는 CORS가 필요 없고, 다른 오리진(Tauri 웹뷰)이 생길 때만 부트가 env로 켠다.
  corsOrigins?: string[];
  // clientCheck(NFR-305, DS2-3). 미설정 = skip(로컬 — C2.3 §0 계약). 남용 억제 수단이다.
  clientCheck?: ClientCheckConfig;
}

// 운영 한도에서 클라이언트 게이팅용 부분집합(/config 응답)을 파생한다.
function toClientLimits(l: Limits): ClientLimits {
  return {
    narrowMax: l.narrowMax,
    narrowMin: l.narrowMin,
    detailLimitFree: l.detailLimitFree,
    freeWeeklyLimit: l.freeWeeklyLimit,
    maxTotal: l.maxTotal,
    groupGen: l.groupGen,
    maxContextChars: l.maxContextChars,
    attachRequiresPro: l.attachRequiresPro,
  };
}

export function createApp(deps: AppDeps): Hono {
  const pipeline = createPipeline(deps);
  // client_id는 있을 때만 싣는다. 없으면 키 자체가 없어야 클라가 로그인을 감춘다(S5a A-2).
  const clientLimits: ClientLimits = {
    ...toClientLimits(deps.limits ?? DEFAULT_LIMITS),
    ...(deps.googleClientId ? { googleClientId: deps.googleClientId } : {}),
  };

  const app = new Hono();

  // 순서가 계약이다: CORS → clientCheck → 게이팅 → 라우트.
  // CORS가 먼저여야 프리플라이트(OPTIONS)가 clientCheck의 403을 맞지 않는다 — 프리플라이트에는
  // 커스텀 헤더가 실리지 않으므로 뒤에 두면 데스크톱의 모든 교차 요청이 시작조차 못 한다.
  if (deps.corsOrigins && deps.corsOrigins.length > 0) {
    app.use(
      "*",
      cors({
        origin: deps.corsOrigins,
        allowHeaders: ["authorization", "content-type", "x-vock-client"],
        allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      })
    );
  }
  if (deps.clientCheck) installClientCheck(app, deps.clientCheck);

  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/config", (c) => c.json(clientLimits));

  const repos = deps.repos;
  const detailCache = repos ? buildDetailCache(repos) : undefined;

  // 게이팅은 라우트 등록 전에 install해야 핸들러보다 먼저 돈다(§4).
  if (deps.counters) {
    const authService = deps.authService;
    const resolveIdentity = authService
      ? async (b: string | null): Promise<{ tier: Tier; userId: string | null }> => {
          // tier 판정은 AuthService.resolveTier 하나만 쓴다. 여기서 claims.tier를 직접 읽으면
          // 같은 결정에 구현이 둘이 되고, resolveTier에만 있는 DEV_FORCE_TIER override가
          // 게이팅 경로에서만 조용히 무시된다(실측 2026-07-29).
          // 토큰 검증이 두 번 도는 비용은 감수한다. HS256 로컬 검증이라 networkless다(SoT §4).
          const tier = await authService.resolveTier(b);
          const claims = b ? await authService.verifyAccessToken(b) : null;
          return { tier, userId: claims ? claims.sub : null };
        }
      : async (): Promise<{ tier: Tier; userId: string | null }> => ({ tier: "free", userId: null });
    installGating(app, { counters: deps.counters, limits: deps.limits ?? DEFAULT_LIMITS, resolveIdentity });
  }

  // 세션에서 프로젝트를 읽는다. 요청 본문이 프로젝트를 지정하지 않는다(S5 S-25) —
  // 세션 조회가 소유자 대조를 하므로 남의 프로젝트 어휘는 구조적으로 못 읽는다.
  const dedup = repos
    ? async (userId: string, sessionId: string): Promise<string[]> => {
        const rec = await repos.sessions.get(userId, sessionId);
        return rec?.project_id ? repos.assets.termNormsByProject(userId, rec.project_id) : [];
      }
    : undefined;
  registerPipelineRoutes(app, pipeline, dedup, deps.limits ?? DEFAULT_LIMITS, detailCache);
  if (deps.authService) registerAuthRoutes(app, deps.authService);
  const resolveUserId = deps.authService ? jwtResolveUserId(deps.authService) : devResolveUserId();
  if (deps.repos) registerCrudRoutes(app, deps.repos, resolveUserId);
  return app;
}
