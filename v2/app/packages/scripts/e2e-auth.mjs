// C2.2 완료 기준: 인증 흐름 + JWT로 CRUD. Docker PG 필요. Mock Google로 실 크레덴셜 없이 검증.
// 로그인 → access/refresh → access로 CRUD(x-user-id 없이) → status → refresh 재발급 → logout(revoke) → 재사용 401 → 위조 401.
import { createPgPool, PgSqlRunner, migrate, buildLocalAuthDeps, bootLocal, MockGoogleOAuthClient } from "@vock/local";

const DB = process.env.DATABASE_URL || "postgres://vock:vock@localhost:5433/vock";
const EMAIL = "e2e_auth@test.local";

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
// 멱등: 테스트 유저 데이터 정리(이메일 기준).
const existing = await sql.query("SELECT user_id FROM users WHERE email = $1", [EMAIL]);
if (existing[0]) {
  const uid = existing[0].user_id;
  for (const t of ["assets", "sessions", "knowledge", "projects"]) await sql.execute(`DELETE FROM ${t} WHERE user_id = $1`, [uid]);
  await sql.execute("DELETE FROM users WHERE user_id = $1", [uid]);
}

const google = new MockGoogleOAuthClient({ sub: "g_e2e_123", email: EMAIL, email_verified: true });
const config = { jwtSecretCurrent: "dev-secret-current", jwtKid: "dev" };
const { server, port } = await bootLocal({ port: 0, deps: buildLocalAuthDeps(sql, config, google) });
const base = `http://127.0.0.1:${port}`;
console.log(`local 인증 부트 기동: ${base}`);

try {
  // 1. 로그인
  const login = await req(base, "POST", "/auth/google", { body: { code: "authcode", code_verifier: "verifier", redirect_uri: "http://localhost/cb", platform: "web" } });
  check("POST /auth/google 200", login.status === 200, `status=${login.status}`);
  check("토큰·유저 반환", typeof login.json?.access_token === "string" && typeof login.json?.refresh_token === "string" && login.json?.user?.email === EMAIL);
  const access = login.json?.access_token;
  const refresh = login.json?.refresh_token;

  // 2. access로 CRUD(x-user-id 없이)
  const sid = crypto.randomUUID();
  const put = await req(base, "PUT", `/sessions/${sid}`, { bearer: access, body: { topic: "인증 후 세션", domain_risk: "low", job_type: ["이해학습"] } });
  check("JWT로 PUT /sessions 200", put.status === 200 && put.json?.session_id === sid);
  const get = await req(base, "GET", `/sessions/${sid}`, { bearer: access });
  check("JWT로 GET /sessions 200", get.status === 200 && get.json?.topic === "인증 후 세션");

  // 3. Bearer 없으면 401
  const noauth = await req(base, "GET", `/sessions/${sid}`, {});
  check("Bearer 없음 → 401", noauth.status === 401);

  // 4. 위조 토큰 401
  const forged = await req(base, "GET", `/sessions/${sid}`, { bearer: "not.a.jwt" });
  check("위조 토큰 → 401", forged.status === 401);

  // 5. subscription/status
  const status = await req(base, "GET", "/subscription/status", { bearer: access });
  check("GET /subscription/status 200·free", status.status === 200 && status.json?.tier === "free" && typeof status.json?.access_token === "string");

  // 6. refresh 재발급
  const refreshed = await req(base, "POST", "/auth/refresh", { body: { refresh_token: refresh } });
  check("POST /auth/refresh 200", refreshed.status === 200 && typeof refreshed.json?.access_token === "string");

  // 7. logout → 같은 refresh 재사용 401(revoke)
  const logout = await req(base, "POST", "/auth/logout", { body: { refresh_token: refresh } });
  check("POST /auth/logout 204", logout.status === 204);
  const reuse = await req(base, "POST", "/auth/refresh", { body: { refresh_token: refresh } });
  check("revoke된 refresh 재사용 → 401", reuse.status === 401 && reuse.json?.error === "TOKEN_REVOKED");

  // 8. Google 실패 경로
  const fail = await req(base, "POST", "/auth/google", { body: { code: "fail", code_verifier: "v", redirect_uri: "http://localhost/cb", platform: "web" } });
  check("Google 교환 실패 → 401", fail.status === 401 && fail.json?.error === "AUTH_FAILED");
} finally {
  await new Promise((r) => server.close(() => r()));
  await pool.end();
}

if (failures > 0) { console.error(`\nlocal 인증 e2e 실패: ${failures}건.`); process.exit(1); }
console.log("\nlocal 인증 e2e 통과: OAuth 로그인·JWT CRUD·refresh·logout revoke·위조/실패 경로.");
