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
  StreamEvent,
} from "@sidetab/shared";
import type { RecommendInput } from "@sidetab/shared";
import { UpstashUsageCounter, FREE_WEEKLY_LIMIT } from "./usage-counter.js";

// Workers env 바인딩 타입. wrangler.toml의 [vars]와 secrets에 대응한다.
export interface Env {
  DEEPSEEK_API_KEY: string;
  TAVILY_API_KEY: string;
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
}

// 요청마다 호출되는 구성 루트. Workers env를 인터페이스 구현체로 매핑한다.
function buildPipeline(env: Env) {
  const llm = new DeepSeekLlmClient({ apiKey: env.DEEPSEEK_API_KEY });
  const search = new TavilySearchProvider({ apiKey: env.TAVILY_API_KEY });
  const cache = new UpstashCacheStore({
    url: env.UPSTASH_REDIS_REST_URL,
    token: env.UPSTASH_REDIS_REST_TOKEN,
  });
  return createPipeline({ llm, search, cache });
}

const app = new Hono<{ Bindings: Env }>();

// CORS 미들웨어. chrome-extension 스킴과 로컬 개발 origin을 허용한다.
// host_permissions 등록 도메인과 맞춰야 한다(extension/manifest.json 참조).
app.use(
  "/*",
  cors({
    origin: (origin) => {
      // chrome-extension 페이지, 로컬 개발 서버를 모두 허용한다.
      if (!origin) return "*";
      if (origin.startsWith("chrome-extension://")) return origin;
      if (origin.startsWith("http://localhost")) return origin;
      if (origin.startsWith("http://127.0.0.1")) return origin;
      // 그 외는 null 반환으로 차단한다(CORS 헤더 미포함).
      return null;
    },
    allowMethods: ["POST", "OPTIONS"],
    allowHeaders: ["Content-Type", "x-user-id", "x-tier"],
    maxAge: 86400,
  })
);

// POST /classify
// Prompt1In -> pipeline.classify -> JSON
app.post("/classify", async (c) => {
  const body = await c.req.json<Prompt1In>();
  const pipeline = buildPipeline(c.env);
  const result = await pipeline.classify(body);
  return c.json(result);
});

// POST /next
// Prompt2In -> pipeline.nextBranch -> JSON
app.post("/next", async (c) => {
  const body = await c.req.json<Prompt2In>();
  const pipeline = buildPipeline(c.env);
  const result = await pipeline.nextBranch(body);
  return c.json(result);
});

// POST /recommend
// RecommendInput -> ReadableStream<StreamEvent> -> SSE
// 사용량 게이팅: free 티어는 주 7회 한도(FREE_WEEKLY_LIMIT). paid는 무제한.
// userId는 x-user-id 헤더에서 읽는다.
// 서버 측 설치 UUID 검증은 구현계획 12장(Tier3) 이후로 보류한다.
app.post("/recommend", async (c) => {
  const tier = (c.req.header("x-tier") ?? "free").toLowerCase();
  const userId = c.req.header("x-user-id") ?? "anonymous";

  // free 티어 주간 한도 검사
  if (tier === "free" && userId !== "anonymous") {
    const counter = new UpstashUsageCounter({
      url: c.env.UPSTASH_REDIS_REST_URL,
      token: c.env.UPSTASH_REDIS_REST_TOKEN,
    });
    let count: number;
    try {
      count = await counter.incrAndGet(userId);
    } catch (err) {
      console.error("사용량 카운터 오류:", err);
      // 카운터 오류 시 통과시킨다(서비스 우선, 보수적 접근).
      count = 0;
    }
    if (count > FREE_WEEKLY_LIMIT) {
      return c.json(
        {
          error: "WEEKLY_LIMIT_EXCEEDED",
          message: `무료 티어 주간 한도(${FREE_WEEKLY_LIMIT}회)를 초과했습니다. 유료 플랜으로 업그레이드하면 무제한 이용할 수 있습니다.`,
          count,
          limit: FREE_WEEKLY_LIMIT,
        },
        429
      );
    }
    // anonymous userId는 게이팅 없이 통과한다.
    // 익명 사용자 남용 방어는 Tier3(설치 UUID 바인딩) 이후에 추가한다.
  }

  const body = await c.req.json<RecommendInput>();
  const pipeline = buildPipeline(c.env);

  // AbortController로 업스트림 취소 체인을 구성한다.
  // 클라이언트가 fetch를 취소하면 업스트림 DeepSeek 연결도 중단한다(구현계획 5장).
  const abortCtrl = new AbortController();

  // pipeline.recommendStream은 ReadableStream<StreamEvent>를 반환한다.
  // 클라이언트 연결 끊김(c.req.raw.signal)을 업스트림 DeepSeek까지 전파한다(구현계획 §5 취소 체인).
  const eventStream: ReadableStream<StreamEvent> = pipeline.recommendStream(body, c.req.raw.signal);

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
  const tier = (c.req.header("x-tier") ?? "free").toLowerCase();
  if (tier !== "paid") {
    return c.json(
      { error: "PAID_ONLY", message: "AI 추가 정리는 유료(pro) 플랜 전용입니다. 무료는 기본 정리문을 그대로 쓰세요." },
      402
    );
  }
  const body = await c.req.json<Prompt4In>();
  const pipeline = buildPipeline(c.env);
  const result = await pipeline.summarize(body);
  return c.json(result);
});

// POST /detail
// Prompt5In -> pipeline.detail -> JSON
app.post("/detail", async (c) => {
  const body = await c.req.json<Prompt5In>();
  const pipeline = buildPipeline(c.env);
  const result = await pipeline.detail(body);
  return c.json(result);
});

export default app;
