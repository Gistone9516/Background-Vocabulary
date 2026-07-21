// 실키 스모크(비용 발생·수동 실행 전용, 기본 게이트 제외). 공급자별 1회씩 실호출한다.
// 키는 이 스크립트가 .env를 직접 읽어 쓰며 출력하지 않는다(트랜스크립트·로그 노출 금지).
// 기본 .env = v1/sidetab/.env (VOCK_ENV_FILE로 재지정 가능). 실패해도 다른 공급자는 계속 검사한다.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { DeepSeekLlmClient, TavilySearchProvider, UpstashCacheStore, UpstashCounterStore } from "@vock/providers";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ENV_FILE = process.env.VOCK_ENV_FILE || resolve(APP_ROOT, "../../v1/sidetab/.env");

function loadEnv(file) {
  const out = {};
  let text;
  try {
    text = readFileSync(file, "utf-8");
  } catch {
    throw new Error(`.env 파일을 읽지 못했습니다: ${file}`);
  }
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    out[t.slice(0, eq).trim()] = t.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const results = [];
function record(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? " — " + detail : ""}`);
}
const short = (e) => String(e && e.message ? e.message : e).slice(0, 220);

const env = loadEnv(ENV_FILE);
console.log(`실키 스모크 시작 (env=${ENV_FILE})`);
const model = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";

// 1. DeepSeek — complete(구조화 JSON 1회)
try {
  if (!env.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY 없음");
  const llm = new DeepSeekLlmClient({ apiKey: env.DEEPSEEK_API_KEY, flashModel: model, proModel: model });
  const out = await llm.complete({
    model,
    maxTokens: 120,
    messages: [
      { role: "system", content: 'Return ONLY one raw JSON object of the exact shape {"ok":true,"echo":"<the user word>"}. No markdown.' },
      { role: "user", content: "vock" },
    ],
  });
  record("DeepSeek complete(JSON 1회)", out && typeof out === "object", `echo=${JSON.stringify(out).slice(0, 80)}`);
} catch (e) {
  record("DeepSeek complete(JSON 1회)", false, short(e));
}

// 2. DeepSeek — streamTerms(실 SSE wire → 이식한 증분 파서)
try {
  if (!env.DEEPSEEK_API_KEY) throw new Error("DEEPSEEK_API_KEY 없음");
  const llm = new DeepSeekLlmClient({ apiKey: env.DEEPSEEK_API_KEY, flashModel: model, proModel: model });
  const stream = llm.streamTerms({
    model,
    maxTokens: 500,
    messages: [
      { role: "system", content: 'Return ONLY one raw JSON object: {"terms":[{"term","kind","priority","why","one_line","tag"}]} with EXACTLY 2 items about PID control background vocabulary. tag must be "몰라". Korean values. No markdown.' },
      { role: "user", content: "PID 제어 배경 어휘 2개" },
    ],
  });
  const events = [];
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    events.push(value);
  }
  const terms = events.filter((e) => e.type === "term");
  const err = events.find((e) => e.type === "error");
  record("DeepSeek streamTerms(실 SSE→파서)", terms.length >= 1 && !err, err ? `error=${err.code}` : `terms=${terms.length} first=${terms[0]?.term?.term ?? "?"}`);
} catch (e) {
  record("DeepSeek streamTerms(실 SSE→파서)", false, short(e));
}

// 3. Tavily — 영어 검색 1회 + ko 가드
try {
  if (!env.TAVILY_API_KEY) throw new Error("TAVILY_API_KEY 없음");
  const search = new TavilySearchProvider({ apiKey: env.TAVILY_API_KEY });
  const docs = await search.search({ query: "PID controller anti-windup", locale: "en", depth: "basic", maxResults: 2, rawContent: false });
  record("Tavily 검색(en)", Array.isArray(docs) && docs.length > 0, `docs=${docs.length} first=${(docs[0]?.title ?? "").slice(0, 40)}`);
  let guarded = false;
  try {
    await search.search({ query: "테스트", locale: "ko", depth: "basic", maxResults: 1, rawContent: false });
  } catch {
    guarded = true;
  }
  record("Tavily ko 가드(throw)", guarded);
} catch (e) {
  record("Tavily 검색(en)", false, short(e));
}

// 4. Upstash — 캐시 set/get + 카운터 hit/get
try {
  if (!env.UPSTASH_REDIS_REST_URL || !env.UPSTASH_REDIS_REST_TOKEN) throw new Error("UPSTASH_REDIS_REST_* 없음");
  const conn = { url: env.UPSTASH_REDIS_REST_URL, token: env.UPSTASH_REDIS_REST_TOKEN };
  const cache = new UpstashCacheStore(conn);
  const key = `vock:smoke:${Date.now()}`;
  await cache.set(key, "hello", 60);
  const got = await cache.get(key);
  record("Upstash 캐시 set/get", got === "hello", `got=${got}`);
  let ttlGuard = false;
  try { await cache.set(key + ":bad", "x", 0); } catch { ttlGuard = true; }
  record("Upstash TTL 0 가드(throw)", ttlGuard);

  const counters = new UpstashCounterStore(conn);
  const ckey = `vock:smoke:cnt:${Date.now()}`;
  const n1 = await counters.hit(ckey, 60);
  const n2 = await counters.hit(ckey, 60);
  const cur = await counters.get(ckey);
  record("Upstash 카운터 hit/get", n1 === 1 && n2 === 2 && cur === 2, `n1=${n1} n2=${n2} get=${cur}`);
} catch (e) {
  record("Upstash", false, short(e));
}

const failed = results.filter((r) => !r.ok);
console.log(`\n실키 스모크: ${results.length - failed.length}/${results.length} 통과`);
if (failed.length) {
  console.error("실패 항목: " + failed.map((f) => f.name).join(", "));
  process.exit(1);
}
console.log("전 공급자 실호출 검증 완료.");
