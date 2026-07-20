// Hono 앱 조립. 주입된 포트(PipelineDeps)로 파이프라인을 만들고 라우트를 등록한다.
// 부트(서버 기동)는 여기 없다 — 계층별 부트(local·aws)가 이 앱을 감싼다.

import { Hono } from "hono";
import { createPipeline } from "@vock/core";
import { DEFAULT_LIMITS } from "@vock/shared";
import type { PipelineDeps, ClientLimits, Limits, Repositories } from "@vock/shared";
import { registerPipelineRoutes } from "./routes/pipeline-routes.js";
import { registerCrudRoutes } from "./routes/crud-routes.js";

// 앱 의존 계약. 파이프라인 포트 + (있으면) 영속 리포. 부트가 계층별로 조립해 주입한다.
// repos 미주입(mock UI 개발 부트)이면 CRUD 라우트를 등록하지 않는다 — 파이프라인 라우트는 항상 동작.
export interface AppDeps extends PipelineDeps {
  repos?: Repositories;
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
  registerPipelineRoutes(app, pipeline);
  if (deps.repos) registerCrudRoutes(app, deps.repos);
  return app;
}
