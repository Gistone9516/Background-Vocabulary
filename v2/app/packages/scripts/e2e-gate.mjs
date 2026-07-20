// C2.3 완료 기준: 게이팅. Docker PG 필요. 소한도(freeWeekly=2)로 빠르게 검증.
// 주간한도 소진(402)·/usage 잔여·고위험 403·pro 전용 402·paid 업그레이드 후 우회.
import { createPgPool, PgSqlRunner, migrate, buildLocalAuthDeps, bootLocal, MockGoogleOAuthClient } from "@vock/local";

const DB = process.env.DATABASE_URL || "postgres://vock:vock@localhost:5433/vock";
const EMAIL = "e2e_gate@test.local";

// 게이팅 검증용 소한도(파이프라인은 mock LLM이라 토큰 상한은 무의미).
const LIMITS = {
  termCount: { free: 4, paid: 8 },
  maxTokens: { classify: 900, next: 800, summarize: 1800, recommend: { free: 1400, paid: 2600 }, detail: { free: 900, paid: 1300 } },
  freeWeeklyLimit: 2,
  globalDailyCap: 1000,
  narrowMax: { free: 3, paid: 8 },
  detailLimitFree: 1,
  maxTotal: { free: 8, paid: 32 },
  groupGen: { free: 2, paid: 4 },
  maxInputChars: 4000,
  ratePerMin: 100,
  ratePerDay: 1000,
  maxContextChars: 12000,
};

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  PASS  ${name}`);
  else { failures++; console.error(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}
async function req(base, method, path, opts = {}) {
  const headers = { "content-type": "application/json" };
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
  const res = await fetch(base + path, { method, headers, ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}) });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json };
}

const pool = createPgPool(DB);
const sql = new PgSqlRunner(pool);
await migrate(sql);
const existing = await sql.query("SELECT user_id FROM users WHERE email = $1", [EMAIL]);
if (existing[0]) {
  const uid = existing[0].user_id;
  for (const t of ["assets", "sessions", "knowledge", "projects"]) await sql.execute(`DELETE FROM ${t} WHERE user_id = $1`, [uid]);
  await sql.execute("DELETE FROM users WHERE user_id = $1", [uid]);
}

const google = new MockGoogleOAuthClient({ sub: "g_gate", email: EMAIL, email_verified: true });
const config = { jwtSecretCurrent: "dev-secret", jwtKid: "dev" };
const { server, port } = await bootLocal({ port: 0, deps: buildLocalAuthDeps(sql, config, google, { limits: LIMITS }) });
const base = `http://127.0.0.1:${port}`;
console.log(`local 게이팅 부트 기동: ${base} (freeWeekly=${LIMITS.freeWeeklyLimit})`);

const CLASSIFY = { raw_input: "PID 제어로 로봇 팔 안정화", outputLocale: "ko" };
try {
  const login = await req(base, "POST", "/auth/google", { body: { code: "c", code_verifier: "v", redirect_uri: "http://localhost/cb", platform: "web" } });
  const access = login.json?.access_token;
  const refresh = login.json?.refresh_token;
  check("로그인", login.status === 200 && typeof access === "string");

  // 주간 한도: free 2회 허용, 3회차 402.
  const c1 = await req(base, "POST", "/classify", { bearer: access, body: CLASSIFY });
  const c2 = await req(base, "POST", "/classify", { bearer: access, body: CLASSIFY });
  check("classify 1·2회 200", c1.status === 200 && c2.status === 200, `c1=${c1.status} c2=${c2.status}`);
  const c3 = await req(base, "POST", "/classify", { bearer: access, body: CLASSIFY });
  check("classify 3회차 402 WEEKLY_LIMIT", c3.status === 402 && c3.json?.error === "WEEKLY_LIMIT", `status=${c3.status}`);

  // /usage 잔여 0
  const usage = await req(base, "GET", "/usage", { bearer: access });
  check("GET /usage 잔여 0", usage.status === 200 && usage.json?.weeklyRemaining === 0 && usage.json?.tier === "free");

  // 고위험 1차 방어(recommend는 주간 게이트 없음 — 격리).
  const risk = await req(base, "POST", "/recommend", { bearer: access, body: { area: "x", job_type: [], domain: "other", topic: "자살하고 싶어요", locale: "en", domain_risk: "low", outputLocale: "ko" } });
  check("고위험 입력 403", risk.status === 403 && risk.json?.error === "HIGH_RISK_REFUSED", `status=${risk.status}`);

  // pro 전용: free는 summarize 402.
  const sumFree = await req(base, "POST", "/summarize", { bearer: access, body: { area: "PID", job_type: ["이해학습"], vocab: [] } });
  check("summarize(free) 402 PRO_ONLY", sumFree.status === 402 && sumFree.json?.error === "PRO_ONLY", `status=${sumFree.status}`);

  // paid 업그레이드 → refresh로 새 토큰(tier 재조회) → 우회.
  await sql.execute("UPDATE users SET tier='paid' WHERE email=$1", [EMAIL]);
  const refreshed = await req(base, "POST", "/auth/refresh", { body: { refresh_token: refresh } });
  const paidAccess = refreshed.json?.access_token;
  check("refresh로 paid 토큰", refreshed.status === 200 && typeof paidAccess === "string");
  const sumPaid = await req(base, "POST", "/summarize", { bearer: paidAccess, body: { area: "PID", job_type: ["이해학습"], vocab: [] } });
  check("summarize(paid) 200", sumPaid.status === 200 && typeof sumPaid.json?.paste_text === "string", `status=${sumPaid.status}`);
  const cPaid = await req(base, "POST", "/classify", { bearer: paidAccess, body: CLASSIFY });
  check("classify(paid) 주간한도 우회 200", cPaid.status === 200, `status=${cPaid.status}`);
} finally {
  await new Promise((r) => server.close(() => r()));
  await pool.end();
}

if (failures > 0) { console.error(`\nlocal 게이팅 e2e 실패: ${failures}건.`); process.exit(1); }
console.log("\nlocal 게이팅 e2e 통과: 주간한도·/usage·고위험·pro전용·paid 우회.");
