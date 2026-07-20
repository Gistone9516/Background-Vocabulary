// Hono 앱 조립. 주입된 포트(PipelineDeps)로 파이프라인을 만들고 라우트를 등록한다.
// 부트(서버 기동)는 여기 없다 — 계층별 부트(local·aws)가 이 앱을 감싼다.

import { Hono } from "hono";
import { createPipeline } from "@vock/core";
import { DEFAULT_LIMITS } from "@vock/shared";
import type { PipelineDeps, ClientLimits, Limits } from "@vock/shared";
import { registerPipelineRoutes } from "./routes/pipeline-routes.js";

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

export function createApp(deps: PipelineDeps): Hono {
  const pipeline = createPipeline(deps);
  const clientLimits = toClientLimits(deps.limits ?? DEFAULT_LIMITS);

  const app = new Hono();
  app.get("/health", (c) => c.json({ ok: true }));
  app.get("/config", (c) => c.json(clientLimits));
  registerPipelineRoutes(app, pipeline);
  return app;
}
