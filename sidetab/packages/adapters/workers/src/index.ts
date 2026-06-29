// Cloudflare Workers 진입점. Hono 앱을 빌드하고 fetch 핸들러를 내보낸다.
//
// 구성 루트(요청마다 빌드): Workers env에서 EnvConfig를 만들고
// DeepSeekLlmClient, TavilySearchProvider, UpstashCacheStore를 주입해
// createPipeline으로 Pipeline 인스턴스를 얻는다.
//
// CORS: chrome-extension:// 스킴을 허용한다.
// 이를 위해 manifest.json의 host_permissions에 Workers 도메인(https://sidetab-api.*.workers.dev/*)을
// 좁게 등록해야 한다. 브라우저 자체는 CORS 헤더를 체크하지만
// chrome-extension 페이지는 host_permissions 허용 도메인이면 CORS 없이도 fetch할 수 있다.
// MVP에서는 광역 허용으로 두고, 도메인 확정 후 origin을 좁힌다.

import { Hono } from "hono";
import { cors } from "hono/cors";
import { createPipeline } from "@sidetab/core/pipeline";
import { DeepSeekLlmClient } from "@sidetab/core/llm";
import { TavilySearchProvider } from "@sidetab/providers/tavily";
import { UpstashCacheStore } from "@sidetab/providers/upstash-cache";
import { toSseLine } from "@sidetab/shared";
import type {
  Prompt1In,
  Prompt2In,
  Prompt4In,
  Prompt5In,
  PreviewIn,
  RelateIn,
  StreamEvent,
} from "@sidetab/shared";
import type { RecommendInput, Tier, Limits, ClientLimits, OutputLocale } from "@sidetab/shared";
import { DEFAULT_LIMITS, OUTPUT_LOCALES } from "@sidetab/shared";
import { UpstashUsageCounter, UpstashGlobalDailyCap, UpstashCounter } from "./usage-counter.js";
import { issueTokens, verifyAccess, verifyRefresh } from "./auth/jwt.js";
import { exchangeGoogleCode } from "./auth/google.js";
import { D1UserRepository } from "./db/d1-user-repo.js";
import type { UserRecord, Entitlement } from "@sidetab/shared";

// Workers env 바인딩 타입. wrangler.toml의 [vars]와 secrets에 대응한다.
// 운영 한도는 전부 env로 튜닝한다(미설정이면 DEFAULT_LIMITS). 값은 양의 정수 문자열.
export interface Env {
  DEEPSEEK_API_KEY: string;
  TAVILY_API_KEY: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  TERM_COUNT_FREE?: string; TERM_COUNT_PAID?: string;
  MAXTOK_CLASSIFY?: string; MAXTOK_NEXT?: string; MAXTOK_SUMMARIZE?: string;
  MAXTOK_RECOMMEND_FREE?: string; MAXTOK_RECOMMEND_PAID?: string;
  MAXTOK_DETAIL_FREE?: string; MAXTOK_DETAIL_PAID?: string;
  FREE_WEEKLY_LIMIT?: string; GLOBAL_DAILY_CAP?: string;
  NARROW_MAX_FREE?: string; NARROW_MAX_PAID?: string;
  DETAIL_LIMIT_FREE?: string;
  MAX_TOTAL_FREE?: string; MAX_TOTAL_PAID?: string;
  GROUP_GEN_FREE?: string; GROUP_GEN_PAID?: string;
  MAX_INPUT_CHARS?: string; RATE_PER_MIN?: string; RATE_PER_DAY?: string;
  MAX_CONTEXT_CHARS?: string;
  // 설정 시 이 chrome-extension origin만 허용(프로덕션 확장 ID 잠금). 미설정이면 모든 확장 허용(개발).
  ALLOWED_EXT_ORIGIN?: string;
  // 결제 인증 엔타이틀먼트(Phase 0). 정본 계약은 인터페이스계약 8장이다.
  DB?: D1Database; // 엔타이틀먼트 SoT. 미바인딩이면 인증 라우트는 503이고 기존 추천 흐름은 영향이 없다.
  JWT_SECRET_CURRENT?: string; // HS256 서명키(현재 kid)
  JWT_SECRET_PREV?: string; // 키 로테이션 시 이전 키(이중 검증)
  JWT_KID?: string; // 현재 kid
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string; // Worker 전용. 클라이언트에 노출하지 않는다.
  GOOGLE_REDIRECT_URI?: string; // 형식은 https://<확장 id>.chromiumapp.org/ 이다.
  PAYMENT_ENABLED?: string; // "true"면 실 결제. 아니면 checkout 은 준비 중 스텁이다(b안).
  DEV_MODE?: string; // "true"일 때만 DEV_FORCE_TIER 를 허용한다(프로덕션은 미설정).
  DEV_FORCE_TIER?: string; // 개발 중 티어 강제이며 값은 "free" 또는 "paid"다.
}

// 양의 정수 문자열을 파싱한다. 비거나 잘못되면 기본값.
function num(v: string | undefined, d: number): number {
  const n = Number(v ?? "");
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
}

// env에서 운영 한도를 읽어 Limits를 만든다. 미설정 값은 DEFAULT_LIMITS로 채운다.
function buildLimits(env: Env): Limits {
  const D = DEFAULT_LIMITS;
  return {
    termCount: { free: num(env.TERM_COUNT_FREE, D.termCount.free), paid: num(env.TERM_COUNT_PAID, D.termCount.paid) },
    maxTokens: {
      classify: num(env.MAXTOK_CLASSIFY, D.maxTokens.classify),
      next: num(env.MAXTOK_NEXT, D.maxTokens.next),
      summarize: num(env.MAXTOK_SUMMARIZE, D.maxTokens.summarize),
      recommend: { free: num(env.MAXTOK_RECOMMEND_FREE, D.maxTokens.recommend.free), paid: num(env.MAXTOK_RECOMMEND_PAID, D.maxTokens.recommend.paid) },
      detail: { free: num(env.MAXTOK_DETAIL_FREE, D.maxTokens.detail.free), paid: num(env.MAXTOK_DETAIL_PAID, D.maxTokens.detail.paid) },
    },
    freeWeeklyLimit: num(env.FREE_WEEKLY_LIMIT, D.freeWeeklyLimit),
    globalDailyCap: num(env.GLOBAL_DAILY_CAP, D.globalDailyCap),
    narrowMax: { free: num(env.NARROW_MAX_FREE, D.narrowMax.free), paid: num(env.NARROW_MAX_PAID, D.narrowMax.paid) },
    detailLimitFree: num(env.DETAIL_LIMIT_FREE, D.detailLimitFree),
    maxTotal: { free: num(env.MAX_TOTAL_FREE, D.maxTotal.free), paid: num(env.MAX_TOTAL_PAID, D.maxTotal.paid) },
    groupGen: { free: num(env.GROUP_GEN_FREE, D.groupGen.free), paid: num(env.GROUP_GEN_PAID, D.groupGen.paid) },
    maxInputChars: num(env.MAX_INPUT_CHARS, D.maxInputChars),
    ratePerMin: num(env.RATE_PER_MIN, D.ratePerMin),
    ratePerDay: num(env.RATE_PER_DAY, D.ratePerDay),
    maxContextChars: num(env.MAX_CONTEXT_CHARS, D.maxContextChars),
  };
}

// 입력 크기 검증(context-aware). context_object는 큰 상한(maxContextChars), 나머지 필드는 maxInputChars로 본다.
function oversized(body: unknown, limits: Limits): boolean {
  if (body && typeof body === "object" && !Array.isArray(body)) {
    const ctx = (body as Record<string, unknown>)["context_object"];
    if (typeof ctx === "string" && ctx.length > limits.maxContextChars) return true;
    // context_object를 뺀 나머지를 일반 상한으로 검사한다.
    const rest = { ...(body as Record<string, unknown>), context_object: undefined };
    return oversizedField(rest, limits.maxInputChars);
  }
  return oversizedField(body, limits.maxInputChars);
}

// 클라이언트 IP를 읽는다. Cloudflare는 CF-Connecting-IP를 신뢰 헤더로 채운다.
// 로컬(wrangler dev)엔 없을 수 있어 폴백한다. 레이트리밋 키로만 쓴다(스푸핑 방어는 CF가 담당).
function readIp(c: { req: { header(name: string): string | undefined } }): string {
  return c.req.header("cf-connecting-ip") || (c.req.header("x-forwarded-for") || "").split(",")[0]?.trim() || "unknown";
}

// IP당 분/일 요청 레이트리밋. 한도 초과면 true. Upstash 오류 시 통과(서비스 우선).
// x-user-id를 스푸핑해도 IP 기준이라 우회 불가다. 인증 없는 anti-abuse의 핵심이다.
async function rateLimited(env: Env, ip: string, limits: Limits): Promise<boolean> {
  try {
    const counter = new UpstashCounter({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
    const minBucket = Math.floor(Date.now() / 60000);
    const day = new Date().toISOString().slice(0, 10);
    const [m, d] = await Promise.all([
      counter.hit(`rl:m:${ip}:${minBucket}`, 120),
      counter.hit(`rl:d:${ip}:${day}`, 24 * 60 * 60),
    ]);
    return m > limits.ratePerMin || d > limits.ratePerDay;
  } catch (err) {
    console.error("레이트리밋 카운터 오류:", err);
    return false;
  }
}

// 파싱된 요청 바디에서 사용자 입력 텍스트가 상한을 넘는지 재귀로 검사한다(토큰 비용·인젝션 방어).
function oversizedField(v: unknown, max: number): boolean {
  if (typeof v === "string") return v.length > max;
  if (Array.isArray(v)) return v.some((x) => oversizedField(x, max));
  if (v && typeof v === "object") return Object.values(v).some((x) => oversizedField(x, max));
  return false;
}

// 보안 사전 게이트(레이트리밋). 바디 파싱 전에 호출. 차단되면 Response, 통과면 null.
async function securityBlock(c: { req: { header(name: string): string | undefined }; json(o: unknown, s?: number): Response }, env: Env, limits: Limits): Promise<Response | null> {
  if (await rateLimited(env, readIp(c), limits)) {
    return c.json({ error: "RATE_LIMITED", message: "요청이 너무 잦아요. 잠시 후 다시 시도해 주세요." }, 429);
  }
  return null;
}

// Bearer 토큰을 헤더에서 꺼낸다. 없으면 null 이다.
function bearer(c: { req: { header(name: string): string | undefined } }): string | null {
  const h = c.req.header("authorization") ?? c.req.header("Authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  const tok = m?.[1];
  return tok ? tok.trim() : null;
}

// JWT 서명 검증에 쓸 후보 시크릿이다(현재 키와 이전 키). 키 로테이션을 흡수한다.
function jwtSecrets(env: Env): string[] {
  return [env.JWT_SECRET_CURRENT, env.JWT_SECRET_PREV].filter((s): s is string => !!s);
}

// 요청의 유효 티어를 정한다. per-request 는 networkless 다(서명과 exp 만 보고 외부호출은 없다).
// 무인증이나 익명은 free 로 본다(기존 흐름 보존). x-tier 헤더 신뢰는 폐기했다.
async function resolveTier(c: { req: { header(name: string): string | undefined } }, env: Env): Promise<Tier> {
  if (env.DEV_MODE === "true" && env.DEV_FORCE_TIER) {
    return env.DEV_FORCE_TIER === "paid" ? "paid" : "free";
  }
  const token = bearer(c);
  if (!token) return "free";
  const secrets = jwtSecrets(env);
  if (secrets.length === 0) return "free";
  const claims = await verifyAccess(token, secrets);
  return claims ? claims.tier : "free";
}

// 사용자 레코드에서 유효 권한을 계산한다. grace 기간에는 pro 를 유지한다.
function effectiveEntitlement(u: UserRecord): Entitlement {
  const now = Date.now();
  const isPro = u.tier === "paid" || (u.grace_until != null && u.grace_until > now);
  return {
    user_id: u.user_id,
    effective_tier: isPro ? "paid" : "free",
    subscription_status: u.subscription_status,
    expires_at: u.expires_at,
  };
}

// x-locale 헤더를 OutputLocale로 좁힌다(허용 목록 외/미지정이면 ko). 출력 콘텐츠 언어.
function readLocale(c: { req: { header(name: string): string | undefined } }): OutputLocale {
  const v = (c.req.header("x-locale") ?? "").toLowerCase();
  return (OUTPUT_LOCALES as string[]).includes(v) ? (v as OutputLocale) : "ko";
}

// 전역 일일 캡 검사 겸 증가. cap은 buildLimits에서 온다. 비싼 호출(recommend·detail·summarize) 앞에 둔다.
// 캡 초과면 over=true. Upstash 오류 시 통과(서비스 우선, 보수적 접근).
async function bumpGlobalCap(env: Env, cap: number): Promise<{ over: boolean; count: number; cap: number }> {
  try {
    const counter = new UpstashGlobalDailyCap({ url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN });
    const count = await counter.incrAndGet();
    return { over: count > cap, count, cap };
  } catch (err) {
    console.error("전역 일일 캡 카운터 오류:", err);
    return { over: false, count: 0, cap };
  }
}

// 요청마다 호출되는 구성 루트. Workers env를 인터페이스 구현체로 매핑한다.
function buildPipeline(env: Env) {
  const llm = new DeepSeekLlmClient({ apiKey: env.DEEPSEEK_API_KEY });
  const search = new TavilySearchProvider({ apiKey: env.TAVILY_API_KEY });
  const cache = new UpstashCacheStore({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return createPipeline({ llm, search, cache, limits: buildLimits(env) });
}

const app = new Hono<{ Bindings: Env }>();

// CORS 미들웨어. chrome-extension 스킴과 로컬 개발 origin을 허용한다.
// host_permissions 등록 도메인과 맞춰야 한다(extension/manifest.json 참조).
app.use(
  "/*",
  cors({
    origin: (origin, c) => {
      // chrome-extension 페이지, 로컬 개발 서버를 허용한다.
      if (!origin) return "*";
      if (origin.startsWith("chrome-extension://")) {
        const allowed = (c.env as Env).ALLOWED_EXT_ORIGIN;
        // 프로덕션에서 ALLOWED_EXT_ORIGIN을 지정하면 그 확장만 허용한다(잠금). 미설정이면 모든 확장 허용.
        if (allowed && origin !== allowed) return null;
        return origin;
      }
      if (origin.startsWith("http://localhost")) return origin;
      if (origin.startsWith("http://127.0.0.1")) return origin;
      // 그 외는 null 반환으로 차단한다(CORS 헤더 미포함).
      return null;
    },
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization", "x-user-id", "x-locale"],
    maxAge: 86400,
  })
);

// GET /config
// 클라이언트(확장)가 게이팅에 쓰는 운영 한도 부분집합을 돌려준다. env 변경이 재빌드 없이 확장에 반영된다.
app.get("/config", (c) => {
  const L = buildLimits(c.env);
  const client: ClientLimits = { narrowMax: L.narrowMax, detailLimitFree: L.detailLimitFree, freeWeeklyLimit: L.freeWeeklyLimit, maxTotal: L.maxTotal, groupGen: L.groupGen, maxContextChars: L.maxContextChars };
  return c.json(client);
});

// POST /classify
// Prompt1In -> pipeline.classify -> JSON
app.post("/classify", async (c) => {
  const limits = buildLimits(c.env);
  const blocked = await securityBlock(c, c.env, limits); if (blocked) return blocked;

  // 주간 한도(free)는 세션 생성 시점인 classify에서 차감한다(D3: 1 탐색 = 주간 1회). free·비익명만 집계.
  // GET으로 한도를 먼저 확인해 초과면 LLM 호출 전에 막는다(선증가-후차단 방지). 실제 INCR은 분류 성공·비고위험일 때만.
  const tier = await resolveTier(c, c.env);
  const userId = c.req.header("x-user-id") ?? "anonymous";
  const metered = tier === "free" && userId !== "anonymous";
  const counter = new UpstashUsageCounter({ url: c.env.UPSTASH_REDIS_REST_URL, token: c.env.UPSTASH_REDIS_REST_TOKEN });
  if (metered) {
    let count = 0;
    try { count = await counter.getCount(userId); } catch (err) { console.error("주간 카운터 조회 오류:", err); count = 0; }
    if (count >= limits.freeWeeklyLimit) {
      return c.json({ error: "WEEKLY_LIMIT_EXCEEDED", message: `무료 티어 주간 한도(${limits.freeWeeklyLimit}회)를 초과했습니다. 유료 플랜으로 업그레이드하면 무제한 이용할 수 있습니다.`, count, limit: limits.freeWeeklyLimit }, 429);
    }
  }

  // 전역 일일 캡(classify도 DeepSeek를 호출하는 비용 엔드포인트 — recommend·detail·summarize와 캡 일관성).
  const cap = await bumpGlobalCap(c.env, limits.globalDailyCap);
  if (cap.over) {
    return c.json({ error: "GLOBAL_DAILY_CAP", message: "오늘 전체 이용량이 많아 잠시 추천을 멈췄어요. 내일 다시 시도해 주세요.", count: cap.count, cap: cap.cap }, 429);
  }

  const body = await c.req.json<Prompt1In>();
  if (oversized(body, limits)) return c.json({ error: "INPUT_TOO_LARGE", message: "입력이 너무 길어요. 줄여서 다시 시도해 주세요." }, 413);
  const pipeline = buildPipeline(c.env);
  const result = await pipeline.classify(body, readLocale(c));

  // 고위험(거부) 분류는 과금하지 않는다. 정상·비고위험 분류일 때만 주간 카운트를 올린다(세션 생성 = 결제).
  if (metered && result.domain_risk !== "high") {
    try { await counter.incrAndGet(userId); } catch (err) { console.error("주간 카운터 증가 오류:", err); }
  }
  return c.json(result);
});

// POST /next
// Prompt2In -> pipeline.nextBranch -> JSON
app.post("/next", async (c) => {
  const limits = buildLimits(c.env);
  const blocked = await securityBlock(c, c.env, limits); if (blocked) return blocked;
  // 전역 일일 캡(아키네이터 호출도 LLM 비용을 낸다. 레이트리밋만으론 IP 순환으로 우회 가능해 비용 backstop을 더한다).
  const cap = await bumpGlobalCap(c.env, limits.globalDailyCap);
  if (cap.over) return c.json({ error: "GLOBAL_DAILY_CAP", message: "오늘 전체 이용량이 많아 잠시 멈췄어요. 내일 다시 시도해 주세요.", count: cap.count, cap: cap.cap }, 429);
  const body = await c.req.json<Prompt2In>();
  if (oversized(body, limits)) return c.json({ error: "INPUT_TOO_LARGE", message: "입력이 너무 길어요. 줄여서 다시 시도해 주세요." }, 413);
  const pipeline = buildPipeline(c.env);
  const result = await pipeline.nextBranch(body, readLocale(c));
  return c.json(result);
});

// POST /preview
// PreviewIn -> pipeline.preview -> JSON. 난이도 선택 직전 깊이별 대표 어휘. 레이트리밋 + 전역 일일 캡(주간은 미집계, 좁히기와 같은 비용 등급).
app.post("/preview", async (c) => {
  const limits = buildLimits(c.env);
  const blocked = await securityBlock(c, c.env, limits); if (blocked) return blocked;
  const cap = await bumpGlobalCap(c.env, limits.globalDailyCap);
  if (cap.over) return c.json({ error: "GLOBAL_DAILY_CAP", message: "오늘 전체 이용량이 많아 잠시 멈췄어요. 내일 다시 시도해 주세요.", count: cap.count, cap: cap.cap }, 429);
  const body = await c.req.json<PreviewIn>();
  if (oversized(body, limits)) return c.json({ error: "INPUT_TOO_LARGE", message: "입력이 너무 길어요. 줄여서 다시 시도해 주세요." }, 413);
  const pipeline = buildPipeline(c.env);
  const result = await pipeline.preview(body, readLocale(c));
  return c.json(result);
});

// POST /relate
// RelateIn -> pipeline.relate -> JSON. 연결 턴(프로젝트 kept 어휘 연결 판정). 레이트리밋 + 전역 일일 캡(주간은 미집계, 좁히기와 같은 비용 등급).
app.post("/relate", async (c) => {
  const limits = buildLimits(c.env);
  const blocked = await securityBlock(c, c.env, limits); if (blocked) return blocked;
  const cap = await bumpGlobalCap(c.env, limits.globalDailyCap);
  if (cap.over) return c.json({ error: "GLOBAL_DAILY_CAP", message: "오늘 전체 이용량이 많아 잠시 멈췄어요. 내일 다시 시도해 주세요.", count: cap.count, cap: cap.cap }, 429);
  const body = await c.req.json<RelateIn>();
  if (oversized(body, limits)) return c.json({ error: "INPUT_TOO_LARGE", message: "입력이 너무 길어요. 줄여서 다시 시도해 주세요." }, 413);
  // 배열 길이 상한(프롬프트 부풀림 차단). 개별 문자열 길이는 oversized가, 원소 개수는 여기서 막는다(클라 12캡의 서버측 방어선).
  body.kept = (body.kept ?? []).slice(0, 20);
  body.history = (body.history ?? []).slice(0, 20);
  const pipeline = buildPipeline(c.env);
  const result = await pipeline.relate(body, readLocale(c));
  return c.json(result);
});

// POST /recommend
// RecommendInput -> ReadableStream<StreamEvent> -> SSE
// 사용량 게이팅: free 티어는 주 7회 한도(FREE_WEEKLY_LIMIT). paid는 무제한.
// userId는 x-user-id 헤더에서 읽는다.
// 서버 측 설치 UUID 검증은 구현계획 12장(Tier3) 이후로 보류한다.
app.post("/recommend", async (c) => {
  const tier = await resolveTier(c, c.env);
  const limits = buildLimits(c.env);

  // 보안 게이트(IP 레이트리밋). x-user-id 스푸핑과 무관하게 IP 기준으로 남용을 막는다.
  const blocked = await securityBlock(c, c.env, limits); if (blocked) return blocked;

  // 전역 일일 캡(빌드 단계 비용 차단). 티어·사용자 무관. anonymous 우회도 여기서 덮는다.
  const cap = await bumpGlobalCap(c.env, limits.globalDailyCap);
  if (cap.over) {
    return c.json(
      { error: "GLOBAL_DAILY_CAP", message: "오늘 전체 이용량이 많아 잠시 추천을 멈췄어요. 내일 다시 시도해 주세요.", count: cap.count, cap: cap.cap },
      429
    );
  }

  // 주간 한도(free)는 이제 세션 생성 시점인 /classify에서 차감한다(D3). 여기서는 재과금하지 않는다.
  // 이어서 진행(재개) 세션의 생성도 재과금 없이 통과한다. 비용 상한은 위의 전역 일일 캡이 담당한다.
  // (참고: classify 없이 /recommend를 직접 호출하는 우회는 설치 UUID 바인딩 Tier3 전까지 구조적 잔존이며,
  //  현재도 x-user-id 헤더 교체로 우회 가능한 수준과 동급이다. 전역 일일 캡이 비용 backstop.)

  const body = await c.req.json<RecommendInput>();
  if (oversized(body, limits)) return c.json({ error: "INPUT_TOO_LARGE", message: "입력이 너무 길어요. 줄여서 다시 시도해 주세요." }, 413);
  const pipeline = buildPipeline(c.env);

  // AbortController로 업스트림 취소 체인을 구성한다.
  // 클라이언트가 fetch를 취소하면 업스트림 DeepSeek 연결도 중단한다(구현계획 5장).
  const abortCtrl = new AbortController();

  // pipeline.recommendStream은 ReadableStream<StreamEvent>를 반환한다.
  // 클라이언트 연결 끊김(c.req.raw.signal)을 업스트림 DeepSeek까지 전파한다(구현계획 §5 취소 체인).
  const eventStream: ReadableStream<StreamEvent> = pipeline.recommendStream(body, tier, readLocale(c), c.req.raw.signal);

  // StreamEvent를 SSE 바이트로 직렬화하는 TransformStream을 만든다.
  const { readable, writable } = new TransformStream<StreamEvent, Uint8Array>({
    transform(event, controller) {
      const line = toSseLine(event);
      controller.enqueue(new TextEncoder().encode(line));
    },
    flush(controller) {
      // 정상 종료 마커를 붙인다.
      controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
    },
  });

  // 파이프는 await하지 않는다(fire-and-forget). 스트림 자체가 완료와 에러를 전달한다.
  eventStream.pipeTo(writable).catch((err: unknown) => {
    // 클라이언트 연결 끊김이나 취소는 정상 경로이므로 경고만 남긴다.
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes("abort") && !msg.includes("cancel")) {
      console.error("recommend 파이프 오류:", err);
    }
    abortCtrl.abort();
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      // CORS 헤더는 미들웨어에서 이미 붙는다.
    },
  });
});

// POST /summarize
// Prompt4In -> pipeline.summarize -> JSON
// /summarize는 "AI로 더 정리"(유료 전용, D3). free 티어는 클라이언트 템플릿만 쓰므로 여기로 오면 거부.
app.post("/summarize", async (c) => {
  const tier = await resolveTier(c, c.env);
  const limits = buildLimits(c.env);
  const blocked = await securityBlock(c, c.env, limits); if (blocked) return blocked;
  if (tier !== "paid") {
    return c.json(
      { error: "PAID_ONLY", message: "AI 추가 정리는 유료(pro) 플랜 전용입니다. 무료는 기본 정리문을 그대로 쓰세요." },
      402
    );
  }
  const cap = await bumpGlobalCap(c.env, limits.globalDailyCap);
  if (cap.over) {
    return c.json(
      { error: "GLOBAL_DAILY_CAP", message: "오늘 전체 이용량이 많아 잠시 멈췄어요. 내일 다시 시도해 주세요.", count: cap.count, cap: cap.cap },
      429
    );
  }
  const body = await c.req.json<Prompt4In>();
  if (oversized(body, limits)) return c.json({ error: "INPUT_TOO_LARGE", message: "입력이 너무 길어요. 줄여서 다시 시도해 주세요." }, 413);
  const pipeline = buildPipeline(c.env);
  const result = await pipeline.summarize(body, readLocale(c));
  return c.json(result);
});

// POST /detail
// Prompt5In -> pipeline.detail -> JSON
app.post("/detail", async (c) => {
  const tier = await resolveTier(c, c.env);
  const limits = buildLimits(c.env);
  const blocked = await securityBlock(c, c.env, limits); if (blocked) return blocked;
  const cap = await bumpGlobalCap(c.env, limits.globalDailyCap);
  if (cap.over) {
    return c.json(
      { error: "GLOBAL_DAILY_CAP", message: "오늘 전체 이용량이 많아 잠시 멈췄어요. 내일 다시 시도해 주세요.", count: cap.count, cap: cap.cap },
      429
    );
  }
  const body = await c.req.json<Prompt5In>();
  if (oversized(body, limits)) return c.json({ error: "INPUT_TOO_LARGE", message: "입력이 너무 길어요. 줄여서 다시 시도해 주세요." }, 413);
  const pipeline = buildPipeline(c.env);
  const result = await pipeline.detail(body, tier, readLocale(c));
  return c.json(result);
});

// POST /auth/google
// launchWebAuthFlow 가 받은 authorization code 를 Worker 가 교환해 우리 JWT 를 발급한다.
// D1 과 JWT 시크릿과 Google 설정이 없으면 503 이다(기존 추천 흐름엔 영향 없음).
app.post("/auth/google", async (c) => {
  const env = c.env;
  const limits = buildLimits(env);
  const blocked = await securityBlock(c, env, limits); if (blocked) return blocked;
  const { DB, JWT_SECRET_CURRENT, JWT_KID, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = env;
  if (!DB || !JWT_SECRET_CURRENT || !JWT_KID) {
    return c.json({ error: "AUTH_UNAVAILABLE", message: "인증이 아직 구성되지 않았습니다." }, 503);
  }
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    return c.json({ error: "AUTH_UNAVAILABLE", message: "Google 로그인이 아직 구성되지 않았습니다." }, 503);
  }
  const body = (await c.req.json().catch(() => ({}))) as { code?: string; code_verifier?: string; redirect_uri?: string };
  if (!body.code || !body.code_verifier || !body.redirect_uri) {
    return c.json({ error: "AUTH_FAILED", message: "인증 요청이 올바르지 않습니다." }, 401);
  }
  let identity;
  try {
    identity = await exchangeGoogleCode({
      code: body.code,
      codeVerifier: body.code_verifier,
      redirectUri: body.redirect_uri,
      clientId: GOOGLE_CLIENT_ID,
      clientSecret: GOOGLE_CLIENT_SECRET,
    });
  } catch (err) {
    console.error("Google 코드 교환 실패:", err);
    return c.json({ error: "AUTH_FAILED", message: "Google 로그인에 실패했습니다. 다시 시도해 주세요." }, 401);
  }
  const repo = new D1UserRepository(DB);
  // email 로 기존 계정을 찾고 없으면 만든다. google_sub 은 보조 연결 컬럼이다.
  let user = await repo.findByEmail(identity.email);
  if (!user) user = await repo.create({ email: identity.email, google_sub: identity.sub });
  const ent = effectiveEntitlement(user);
  const tokens = await issueTokens(
    { userId: user.user_id, tier: ent.effective_tier, email: user.email },
    JWT_SECRET_CURRENT,
    JWT_KID
  );
  return c.json({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_in: tokens.expires_in,
    user: { email: user.email, tier: ent.effective_tier },
  });
});

// POST /auth/refresh
// 리프레시 토큰으로 액세스 토큰을 재발급한다. 이때 D1 에서 최신 tier 를 다시 읽는다(취소·갱신 반영).
app.post("/auth/refresh", async (c) => {
  const env = c.env;
  const { DB, JWT_SECRET_CURRENT, JWT_KID } = env;
  if (!DB || !JWT_SECRET_CURRENT || !JWT_KID) {
    return c.json({ error: "AUTH_UNAVAILABLE", message: "인증이 아직 구성되지 않았습니다." }, 503);
  }
  const body = (await c.req.json().catch(() => ({}))) as { refresh_token?: string };
  if (!body.refresh_token) return c.json({ error: "TOKEN_REVOKED", message: "다시 로그인해 주세요." }, 401);
  const claims = await verifyRefresh(body.refresh_token, jwtSecrets(env));
  if (!claims) return c.json({ error: "TOKEN_REVOKED", message: "세션이 만료되었습니다. 다시 로그인해 주세요." }, 401);
  // 블랙리스트 검사는 취소·환불 경로가 생기는 Phase 1 에서 활성화한다(Phase 0 은 빈 목록).
  const repo = new D1UserRepository(DB);
  const user = await repo.findById(claims.sub);
  if (!user) return c.json({ error: "TOKEN_REVOKED", message: "계정을 찾을 수 없습니다." }, 401);
  const ent = effectiveEntitlement(user);
  const tokens = await issueTokens(
    { userId: user.user_id, tier: ent.effective_tier, email: user.email },
    JWT_SECRET_CURRENT,
    JWT_KID
  );
  return c.json({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_in: tokens.expires_in });
});

// POST /auth/logout
// Phase 0 은 클라이언트가 저장 토큰을 지우는 것으로 충분하다. 서버 블랙리스트는 Phase 1.
app.post("/auth/logout", (c) => c.json({ ok: true }));

// POST /checkout
// b안. 결제 비활성(PAYMENT_ENABLED 가 "true" 아님)이면 준비 중 스텁이다. 실 결제는 Phase 1 PG 어댑터.
app.post("/checkout", (c) => {
  if (c.env.PAYMENT_ENABLED !== "true") return c.json({ status: "coming_soon" });
  return c.json({ error: "NOT_IMPLEMENTED", message: "결제는 곧 제공됩니다." }, 501);
});

// GET /subscription/status
// 폴링과 복구용. D1 을 직접 조회해 최신 tier 를 확인하고 새 액세스 토큰을 함께 돌려준다.
app.get("/subscription/status", async (c) => {
  const env = c.env;
  const { DB, JWT_SECRET_CURRENT, JWT_KID } = env;
  if (!DB || !JWT_SECRET_CURRENT || !JWT_KID) {
    return c.json({ error: "AUTH_UNAVAILABLE", message: "인증이 아직 구성되지 않았습니다." }, 503);
  }
  const token = bearer(c);
  if (!token) return c.json({ error: "AUTH_REQUIRED", message: "로그인이 필요합니다." }, 401);
  const claims = await verifyAccess(token, jwtSecrets(env));
  if (!claims) return c.json({ error: "TOKEN_EXPIRED", message: "세션이 만료되었습니다. 다시 로그인해 주세요." }, 401);
  const repo = new D1UserRepository(DB);
  const user = await repo.findById(claims.sub);
  if (!user) return c.json({ error: "AUTH_REQUIRED", message: "계정을 찾을 수 없습니다." }, 401);
  const ent = effectiveEntitlement(user);
  const tokens = await issueTokens(
    { userId: user.user_id, tier: ent.effective_tier, email: user.email },
    JWT_SECRET_CURRENT,
    JWT_KID
  );
  return c.json({
    tier: ent.effective_tier,
    subscription_status: ent.subscription_status,
    expires_at: ent.expires_at,
    access_token: tokens.access_token,
  });
});

export default app;
