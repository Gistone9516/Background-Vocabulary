// 게이팅 미들웨어(SoT §4). 비용 엔드포인트에 공통 적용: 티어 해석·IP/전역 캡·고위험 1차 방어·
// free 주간 한도(TR-02 재차감 금지)·pro 전용·상세 한도. 카운터 장애 시 fail-open(NFR-404).
// 라우트 등록 전에 install해야 미들웨어가 핸들러보다 먼저 돈다.

import type { Hono } from "hono";
import type { CounterStore, Limits, Tier } from "@vock/shared";
import { isHighRiskInput } from "@vock/core";
import { bearer } from "./auth.js";

type Ctx = { req: { header(name: string): string | undefined } };

// Hono 컨텍스트 변수 접근(제네릭 Variables 미선언 시 key가 never로 좁혀지는 것을 우회).
const setVar = (c: unknown, k: string, v: unknown): void => (c as { set(k: string, v: unknown): void }).set(k, v);
const getVar = (c: unknown, k: string): unknown => (c as { get(k: string): unknown }).get(k);

export interface GateDeps {
  counters: CounterStore;
  limits: Limits;
  // Bearer → 신원. 로그인=JWT claims, 익명=null userId·free.
  resolveIdentity: (bearerToken: string | null) => Promise<{ tier: Tier; userId: string | null }>;
}

const DAY_TTL = 24 * 60 * 60;
const MIN_TTL = 60;
const WEEK_TTL = 7 * 24 * 60 * 60;
// client-check.ts가 같은 목록을 쓴다(C4 S2). 두 벌이면 새 비용 경로가 한쪽에서만 걸러진다.
export const COST_PATHS = ["/classify", "/next", "/preview", "/relate", "/recommend", "/detail", "/summarize", "/refine-primer"];

function ipOf(c: Ctx): string {
  return c.req.header("x-real-ip") ?? c.req.header("x-forwarded-for")?.split(",")[0]?.trim() ?? "0.0.0.0";
}
function weeklyKey(userId: string | null, ip: string): string {
  return userId ? `week:user:${userId}` : `week:anon:${ip}`;
}

export function installGating(app: Hono, deps: GateDeps): void {
  const { counters, limits, resolveIdentity } = deps;

  // 공통: 티어·신원 해석 + IP 분/일 + 전역 일일 캡. 비용 엔드포인트 전부.
  for (const p of COST_PATHS) {
    app.use(p, async (c, next) => {
      const id = await resolveIdentity(bearer(c));
      setVar(c, "tier", id.tier);
      setVar(c, "gateUserId", id.userId);
      const ip = ipOf(c);
      try {
        if ((await counters.hit(`ip:${ip}:min`, MIN_TTL)) > limits.ratePerMin) return c.json({ error: "RATE_LIMITED", message: "잠시 후 다시 시도해 주세요." }, 429);
        if ((await counters.hit(`ip:${ip}:day`, DAY_TTL)) > limits.ratePerDay) return c.json({ error: "RATE_LIMITED", message: "오늘 요청이 많았어요." }, 429);
        if ((await counters.hit("global:day", DAY_TTL)) > limits.globalDailyCap) return c.json({ error: "CAPACITY", message: "일시적으로 혼잡해요." }, 429);
      } catch {
        // fail-open: 카운터 장애가 서비스를 막지 않는다(NFR-404).
      }
      await next();
    });
  }

  // 고위험 1차 방어(NFR-306): classify·recommend 입구.
  for (const p of ["/classify", "/recommend"]) {
    app.use(p, async (c, next) => {
      const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
      const text = [body.raw_input, body.topic, body.area, body.user_condition].filter((v) => typeof v === "string").join(" ");
      if (isHighRiskInput(text)) return c.json({ error: "HIGH_RISK_REFUSED", message: "안전상 직접 다루지 않는 주제예요." }, 403);
      await next();
    });
  }

  // free 주간 한도: classify(신규 탐색 시작)만 차감. TR-02 — 세션 재개는 /classify를 부르지 않으므로 재차감 없음.
  app.use("/classify", async (c, next) => {
    if ((getVar(c, "tier") as Tier) === "paid") return next();
    const key = weeklyKey(getVar(c, "gateUserId") as string | null, ipOf(c));
    try {
      if ((await counters.get(key)) >= limits.freeWeeklyLimit) return c.json({ error: "WEEKLY_LIMIT", message: "이번 주 무료 탐색을 다 썼어요." }, 402);
      await counters.hit(key, WEEK_TTL);
    } catch {
      // fail-open
    }
    await next();
  });

  // pro 전용: summarize·refine-primer.
  for (const p of ["/summarize", "/refine-primer"]) {
    app.use(p, async (c, next) => {
      if ((getVar(c, "tier") as Tier) !== "paid") return c.json({ error: "PRO_ONLY", message: "pro 전용 기능이에요." }, 402);
      await next();
    });
  }

  // 파일 첨부 티어 게이트(C4 S4 DS4-3). free의 context_object를 거부한다 — 클라 잠금만으로는
  // API 직접 호출로 뚫린다(NFR-308). attachRequiresPro는 env로 덮이는 값이다(TR-06 "참고 기본값" —
  // 정본은 C5 결제 재설계). false로 덮으면 이 미들웨어는 전부 통과한다.
  // context가 실리는 세 경로만 본다(v1 선례: classify·next·recommend 반복 전송).
  if (limits.attachRequiresPro) {
    for (const p of ["/classify", "/next", "/recommend"]) {
      app.use(p, async (c, next) => {
        if ((getVar(c, "tier") as Tier) === "paid") return next();
        const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
        if (typeof body.context_object === "string" && body.context_object.length > 0) {
          return c.json({ error: "PRO_ONLY", message: "파일 첨부는 pro 기능이에요." }, 402);
        }
        await next();
      });
    }
  }

  // free 상세 열람 한도(세션당, NFR-304).
  app.use("/detail", async (c, next) => {
    if ((getVar(c, "tier") as Tier) === "paid") return next();
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const uid = (getVar(c, "gateUserId") as string | null) ?? ipOf(c);
    const sid = (body.session_id as string) ?? "nosession";
    try {
      if ((await counters.hit(`detail:${uid}:${sid}`, WEEK_TTL)) > limits.detailLimitFree) return c.json({ error: "DETAIL_LIMIT", message: "무료 상세 열람을 다 썼어요." }, 402);
    } catch {
      // fail-open
    }
    await next();
  });

  // GET /usage: 잔여 사용량(TR-08). 익명은 IP 기준 추정.
  app.get("/usage", async (c) => {
    const id = await resolveIdentity(bearer(c));
    let used = 0;
    try {
      used = await counters.get(weeklyKey(id.userId, ipOf(c)));
    } catch {
      // fail-open
    }
    return c.json({
      tier: id.tier,
      anonymous: id.userId === null,
      weeklyRemaining: id.tier === "paid" ? null : Math.max(0, limits.freeWeeklyLimit - used),
    });
  });
}
