// 파이프라인 엔드포인트. 라우트는 주입된 Pipeline 계약에만 의존한다(구현 결합 없음).
// tier·outputLocale는 C1에서 요청 바디로 받는다(인증 기반 판정은 C2 게이팅에서 대체).

import type { Hono } from "hono";
import type { Pipeline, OutputLocale, Tier } from "@vock/shared";
import { streamEventsToResponse } from "../sse-response.js";

function readLocale(body: { outputLocale?: unknown }): OutputLocale {
  const v = body.outputLocale;
  return v === "en" || v === "ja" || v === "zh" ? v : "ko";
}
// 게이팅이 해석한 tier(c.get)를 우선한다. 게이팅 미적용(mock 부트)이면 바디 폴백.
function tierOf(c: unknown, body: { tier?: unknown }): Tier {
  const t = (c as { get(k: string): unknown }).get("tier");
  if (t === "paid" || t === "free") return t;
  return body.tier === "paid" ? "paid" : "free";
}

// 라우트 핸들러가 받은 JSON 바디. 파이프라인 입력 + 메타(로케일·티어).
type Body = Record<string, unknown> & { outputLocale?: unknown; tier?: unknown };

export function registerPipelineRoutes(app: Hono, pipeline: Pipeline): void {
  app.post("/classify", async (c) => {
    const body = (await c.req.json()) as Body;
    return c.json(await pipeline.classify(body as never, readLocale(body)));
  });

  app.post("/next", async (c) => {
    const body = (await c.req.json()) as Body;
    return c.json(await pipeline.nextBranch(body as never, readLocale(body)));
  });

  app.post("/preview", async (c) => {
    const body = (await c.req.json()) as Body;
    return c.json(await pipeline.preview(body as never, readLocale(body)));
  });

  app.post("/relate", async (c) => {
    const body = (await c.req.json()) as Body;
    return c.json(await pipeline.relate(body as never, readLocale(body)));
  });

  app.post("/recommend", async (c) => {
    const body = (await c.req.json()) as Body;
    // 클라 끊김을 업스트림 취소로 전파한다(node-server 한정 유효).
    const stream = pipeline.recommendStream(body as never, tierOf(c, body), readLocale(body), c.req.raw.signal);
    return streamEventsToResponse(stream);
  });

  app.post("/detail", async (c) => {
    const body = (await c.req.json()) as Body;
    return c.json(await pipeline.detail(body as never, tierOf(c, body), readLocale(body)));
  });

  app.post("/summarize", async (c) => {
    const body = (await c.req.json()) as Body;
    return c.json(await pipeline.summarize(body as never, readLocale(body)));
  });
}
