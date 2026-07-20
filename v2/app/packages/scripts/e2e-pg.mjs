// C2.1 완료 기준: local PG 계층 CRUD 왕복. Docker PG 필요(docker compose up -d).
// 마이그레이션 → 시드(FK 대상 user) → 세션 생성/조회/목록/담기/knowledge/소프트삭제/restore/소유권409/프로젝트삭제.
// 빌드 산출물(dist) 소비 — 실행 전 pnpm build 선행(gate-db가 보장).
import { createPgPool, PgSqlRunner, buildLocalPgDeps, migrate, bootLocal } from "@vock/local";

const DB = process.env.DATABASE_URL || "postgres://vock:vock@localhost:5433/vock";
const U = "u_e2e_pg";
const U2 = "u_e2e_pg_other";

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  PASS  ${name}`);
  else { failures++; console.error(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}
async function req(base, method, path, userId, body) {
  const res = await fetch(base + path, {
    method,
    headers: { "content-type": "application/json", ...(userId ? { "x-user-id": userId } : {}) },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  let json;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: res.status, json };
}

const pool = createPgPool(DB);
const sql = new PgSqlRunner(pool);

// setup: 스키마 + 시드(멱등 재실행 위해 테스트 데이터 정리).
await migrate(sql);
for (const u of [U, U2]) {
  await sql.execute("DELETE FROM assets WHERE user_id = $1", [u]);
  await sql.execute("DELETE FROM sessions WHERE user_id = $1", [u]);
  await sql.execute("DELETE FROM knowledge WHERE user_id = $1", [u]);
  await sql.execute("DELETE FROM projects WHERE user_id = $1", [u]);
  await sql.execute("INSERT INTO users (user_id, email, created_at) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO NOTHING", [u, u + "@test.local", Date.now()]);
}

const { server, port } = await bootLocal({ port: 0, deps: buildLocalPgDeps(sql) });
const base = `http://127.0.0.1:${port}`;
console.log(`local PG 부트 기동: ${base}  (DB=${DB})`);

const sid = crypto.randomUUID();
try {
  // 1. 세션 upsert
  const put = await req(base, "PUT", `/sessions/${sid}`, U, { topic: "PID 제어 배경", domain_risk: "low", job_type: ["이해학습"], narrow: { question: "q", choices: [], answers: [], turns_left: 3 } });
  check("PUT /sessions 200", put.status === 200, `status=${put.status}`);
  check("세션 소유자·id", put.json?.session_id === sid && put.json?.user_id === U);
  check("세션 생성중(narrow 존재)", put.json?.narrow !== null);

  // 2. 단건·목록
  const get = await req(base, "GET", `/sessions/${sid}`, U);
  check("GET /sessions/:id 200", get.status === 200 && get.json?.topic === "PID 제어 배경");
  const list = await req(base, "GET", `/sessions`, U);
  check("GET /sessions 목록 포함", Array.isArray(list.json?.items) && list.json.items.some((s) => s.session_id === sid));
  check("목록 요약(narrow 미포함·generating 플래그)", list.json.items[0] && list.json.items[0].narrow === undefined && typeof list.json.items[0].generating === "boolean");

  // 3. 담기(자산) + 목록
  const keep = await req(base, "PUT", `/sessions/${sid}/keep`, U, { keep: true, term_norm: "anti-windup", term: { term: "안티와인드업", kind: "기법", priority: 1, why: "w", one_line: "o", tag: "몰라" }, domain_tags: ["control"] });
  check("PUT keep 담기", keep.status === 200 && keep.json?.kept === true && keep.json?.asset?.term_norm === "anti-windup");
  const assets = await req(base, "GET", `/assets`, U);
  check("GET /assets 요약 포함(term_name 뽑힘)", assets.json?.items?.some((a) => a.term_norm === "anti-windup" && a.term_name === "안티와인드업"));

  // 4. 지식 상태 배치
  const know = await req(base, "PUT", `/knowledge`, U, { states: [{ term_norm: "anti-windup", tag: "알아" }] });
  check("PUT /knowledge upsert", know.json?.upserted === 1);

  // 5. 소프트삭제 → 404 → restore → 200
  const del = await req(base, "DELETE", `/sessions/${sid}`, U);
  check("DELETE 204", del.status === 204);
  const getDeleted = await req(base, "GET", `/sessions/${sid}`, U);
  check("삭제 후 404", getDeleted.status === 404);
  const restore = await req(base, "POST", `/sessions/${sid}/restore`, U);
  check("restore 성공", restore.status === 200 && restore.json?.restored === true);
  const getRestored = await req(base, "GET", `/sessions/${sid}`, U);
  check("restore 후 200", getRestored.status === 200);

  // 6. 소유권 409(타 유저가 같은 session_id upsert)
  const hijack = await req(base, "PUT", `/sessions/${sid}`, U2, { topic: "탈취시도", domain_risk: "low", job_type: [] });
  check("소유권 409", hijack.status === 409 && hijack.json?.error === "OWNERSHIP_CONFLICT");

  // 7. 미인증 401
  const noauth = await req(base, "GET", `/sessions`, null);
  check("미인증 401", noauth.status === 401);

  // 8. 프로젝트: 생성→세션 소속→삭제 시 세션 보존(소속만 해제)
  const proj = await req(base, "POST", `/projects`, U, { name: "제어공학" });
  const pid = proj.json?.project_id;
  check("POST /projects 생성", proj.status === 200 && typeof pid === "string");
  await req(base, "PUT", `/sessions/${sid}`, U, { topic: "PID 제어 배경", domain_risk: "low", job_type: ["이해학습"], project_id: pid });
  const delProj = await req(base, "DELETE", `/projects/${pid}`, U);
  check("DELETE /projects 204", delProj.status === 204);
  const sAfter = await req(base, "GET", `/sessions/${sid}`, U);
  check("프로젝트 삭제 후 세션 보존·소속 해제", sAfter.status === 200 && sAfter.json?.project_id === null);
} finally {
  await new Promise((r) => server.close(() => r()));
  await pool.end();
}

if (failures > 0) { console.error(`\nlocal PG e2e 실패: ${failures}건.`); process.exit(1); }
console.log("\nlocal PG e2e 통과: 영속 CRUD 왕복(소유권·소프트삭제·restore·프로젝트 FK 포함).");
