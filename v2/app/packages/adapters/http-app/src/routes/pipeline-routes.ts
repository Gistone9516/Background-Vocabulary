// 파이프라인 엔드포인트. 라우트는 주입된 Pipeline 계약에만 의존한다(구현 결합 없음).
// tier·outputLocale는 C1에서 요청 바디로 받는다(인증 기반 판정은 C2 게이팅에서 대체).

import type { Hono } from "hono";
import type { Limits, Pipeline, OutputLocale, Prompt5Out, Tier } from "@vock/shared";
import { DEFAULT_LIMITS } from "@vock/shared";
import { streamEventsToResponse } from "../sse-response.js";

// 서버 측 context 절단(C4 S4 DS4-2). maxContextChars는 "보안 하드닝" 주석을 달고도 강제 지점이
// 0곳이었다(실측) — 클라 절단은 UX지 하드닝이 아니다. 거부가 아니라 절단인 이유: 정직하게 잘라
// 보낸 클라와 같은 결과가 되어야 정직한 클라와 악의적 클라의 출력이 같아진다.
export function clampContext(body: Body, max: number): Body {
  const v = body.context_object;
  if (typeof v !== "string" || v.length <= max) return body;
  return { ...body, context_object: v.slice(0, max) };
}

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

// 게이팅이 심어 둔 신원. 없으면 익명이다.
function userIdOf(c: unknown): string | null {
  const v = (c as { get(k: string): unknown }).get("gateUserId");
  return typeof v === "string" && v ? v : null;
}

// 라우트 핸들러가 받은 JSON 바디. 파이프라인 입력 + 로케일 메타.
// tier는 여기 없다. 요청 입력이 권한을 정하지 않는다.
type Body = Record<string, unknown> & { outputLocale?: unknown };

// 프로젝트 dedup 조회. Repositories 전체가 아니라 필요한 질문 하나만 받는다 —
// 라우트가 영속 계층 전체에 결합되면 파이프라인 계약만 의존한다는 성질이 깨진다.
// 로그인하지 않았거나 세션이 프로젝트에 안 붙어 있으면 빈 배열이다(S5 S-26).
async function mergeProjectExclude(body: Body, userId: string | null, dedup?: ProjectDedup): Promise<Body> {
  const sessionId = typeof body.session_id === "string" ? body.session_id : null;
  if (!dedup || !userId || !sessionId) return body;
  // 조회 실패가 추천 실패가 되면 안 된다. dedup은 품질 보정이지 관문이 아니다.
  const norms = await dedup(userId, sessionId).catch(() => []);
  if (norms.length === 0) return body;
  const shown = Array.isArray(body.exclude) ? (body.exclude as string[]) : [];
  return { ...body, exclude: [...new Set([...shown, ...norms])] };
}

export type ProjectDedup = (userId: string, sessionId: string) => Promise<string[]>;

// 생성된 상세를 영속한다(FR-401). 성공 응답만 부른다(E-6).
export type DetailSave = (userId: string | null, body: Record<string, unknown>, out: Prompt5Out) => Promise<void>;

export function registerPipelineRoutes(
  app: Hono,
  pipeline: Pipeline,
  dedup?: ProjectDedup,
  limits?: Limits,
  saveDetail?: DetailSave
): void {
  const maxCtx = (limits ?? DEFAULT_LIMITS).maxContextChars;

  app.post("/classify", async (c) => {
    const body = clampContext((await c.req.json()) as Body, maxCtx);
    return c.json(await pipeline.classify(body as never, readLocale(body)));
  });

  app.post("/next", async (c) => {
    const body = clampContext((await c.req.json()) as Body, maxCtx);
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
    const body = clampContext((await c.req.json()) as Body, maxCtx);
    // FR-706 dedup은 서버 책임이다(SoT §3-3). 클라가 보낸 exclude에 프로젝트 어휘를 기대하지 않는다 —
    // 클라에 맡기면 그것을 빠뜨린 호출자마다 중복이 나온다.
    const merged = await mergeProjectExclude(body, userIdOf(c), dedup);
    // 클라 끊김을 업스트림 취소로 전파한다(node-server 한정 유효).
    const stream = pipeline.recommendStream(merged as never, tierOf(c), readLocale(body), c.req.raw.signal);
    return streamEventsToResponse(stream);
  });

  app.post("/detail", async (c) => {
    const body = (await c.req.json()) as Body;
    // 캐시 히트는 여기까지 오지 않는다(게이팅 앞단에서 응답). 여기 온 것은 전부 새 생성이다.
    const out = await pipeline.detail(body as never, tierOf(c), readLocale(body));
    // 성공만 저장한다(E-6). 저장 실패가 열람 실패가 되면 안 된다 — 본문은 이미 손에 있다.
    if (saveDetail) await saveDetail(userIdOf(c), body, out).catch(() => undefined);
    return c.json(out);
  });

  app.post("/summarize", async (c) => {
    // Prompt4In도 context_object를 받으므로 같은 절단을 태운다 — 필드가 있는 곳이 절단 대상이다.
    const body = clampContext((await c.req.json()) as Body, maxCtx);
    return c.json(await pipeline.summarize(body as never, readLocale(body)));
  });
}
