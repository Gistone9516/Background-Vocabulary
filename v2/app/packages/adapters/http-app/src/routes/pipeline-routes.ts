// 파이프라인 엔드포인트. 라우트는 주입된 Pipeline 계약에만 의존한다(구현 결합 없음).
// tier·outputLocale는 C1에서 요청 바디로 받는다(인증 기반 판정은 C2 게이팅에서 대체).

import type { Hono } from "hono";
import type { Pipeline, OutputLocale, Tier } from "@vock/shared";
import { streamEventsToResponse } from "../sse-response.js";

function readLocale(body: { outputLocale?: unknown }): OutputLocale {
  const v = body.outputLocale;
  return v === "en" || v === "ja" || v === "zh" ? v : "ko";
}
// tier는 게이팅이 검증한 JWT에서만 온다(SoT §4: "x-tier류 헤더 완전 무시").
// 예전에는 게이팅 미적용 부트에서 body.tier로 폴백했는데, 그러면 클라이언트가 자기 등급을
// 선언하게 되어 서버가 강제하는 한도를 클라가 정하는 셈이 된다. 게이팅이 없으면 free다.
function tierOf(c: unknown): Tier {
  const t = (c as { get(k: string): unknown }).get("tier");
  return t === "paid" ? "paid" : "free";
}

// 라우트 핸들러가 받은 JSON 바디. 파이프라인 입력 + 로케일 메타.
// tier는 여기 없다. 요청 입력이 권한을 정하지 않는다.
type Body = Record<string, unknown> & { outputLocale?: unknown };

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
    const stream = pipeline.recommendStream(body as never, tierOf(c), readLocale(body), c.req.raw.signal);
    return streamEventsToResponse(stream);
  });

  app.post("/detail", async (c) => {
    const body = (await c.req.json()) as Body;
    return c.json(await pipeline.detail(body as never, tierOf(c), readLocale(body)));
  });

  app.post("/summarize", async (c) => {
    const body = (await c.req.json()) as Body;
    return c.json(await pipeline.summarize(body as never, readLocale(body)));
  });
}
