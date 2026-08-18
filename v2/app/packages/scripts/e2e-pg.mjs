// C2.1 완료 기준: local PG 계층 CRUD 왕복. Docker PG 필요(docker compose up -d).
// 마이그레이션 → 시드(FK 대상 user) → 세션 생성/조회/목록/담기/knowledge/소프트삭제/restore/소유권409/프로젝트삭제.
// 빌드 산출물(dist) 소비 — 실행 전 pnpm build 선행(gate-db가 보장).
import { createPgPool, PgSqlRunner, buildLocalPgDeps, migrate, bootLocal } from "@vock/local";
import { toSessionRec, toSnapshot } from "@vock/ui-shared";

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
  await sql.execute("DELETE FROM details WHERE user_id = $1", [u]);
  await sql.execute("DELETE FROM projects WHERE user_id = $1", [u]);
  await sql.execute("INSERT INTO users (user_id, email, created_at) VALUES ($1,$2,$3) ON CONFLICT (user_id) DO NOTHING", [u, u + "@test.local", Date.now()]);
}

const { server, port } = await bootLocal({ port: 0, deps: buildLocalPgDeps(sql) });
const base = `http://127.0.0.1:${port}`;
console.log(`local PG 부트 기동: ${base}  (DB=${DB})`);

// 클라이언트가 만드는 좁히기 맥락. 저장 형태를 손으로 적지 않기 위한 재료다.
const CLASSIFY = {
  domain: "pid_control",
  job_type: ["이해학습"],
  condition_required: false,
  question: "어느 쪽을 먼저 이해하고 싶으세요?",
  choices: [{ label: "제어기가 흔들리는 이유" }],
  search_locale: "en",
  domain_risk: "low",
};
const CTX = (sessionId) => ({
  sessionId,
  topic: "PID 제어 배경",
  cond: "",
  classifyOut: CLASSIFY,
  firstQuestion: { question: CLASSIFY.question, choices: CLASSIFY.choices },
  answers: [{ kind: "picks", labels: ["제어기가 흔들리는 이유"] }],
  simplify: true,
  usedUndo: true,
  confidence: 0.7,
});
const CUR = { question: "구체적으로 어떤 상황인가요?", choices: [{ label: "적분이 쌓이는 경우" }] };

const sid = crypto.randomUUID();
try {
  // 1. 세션 upsert. 본문은 클라이언트가 실제로 만드는 것을 그대로 쓴다 —
  // 손으로 적은 본문은 클라 형태가 바뀌어도 계속 통과해서 이음매가 어긋난 걸 못 잡는다.
  const draft = toSessionRec({ ctx: CTX(sid), narrow: toSnapshot(CTX(sid), CUR), generated: null, prev: null, now: Date.now() });
  const put = await req(base, "PUT", `/sessions/${sid}`, U, draft);
  check("PUT /sessions 200", put.status === 200, `status=${put.status}`);
  check("세션 소유자·id", put.json?.session_id === sid && put.json?.user_id === U);
  check("세션 생성중(narrow 존재)", put.json?.narrow !== null);
  // S-20: 재개에 필요한 것이 서버를 왕복해도 남아 있어야 한다.
  check("분류 결과가 왕복에서 살아남는다", put.json?.narrow?.classify?.search_locale === "en");
  check("좁히기 플래그가 왕복에서 살아남는다", put.json?.narrow?.usedUndo === true && put.json?.narrow?.simplify === true);
  check("답변이 턴 단위로 남는다", put.json?.narrow?.answers?.[0]?.kind === "picks");
  // S-4: 파생값은 저장되지 않는다.
  check("남은 턴은 저장되지 않는다", !Object.keys(put.json?.narrow ?? {}).some((k) => /turns|remain|left/i.test(k)));

  // 2. 단건·목록
  const get = await req(base, "GET", `/sessions/${sid}`, U);
  check("GET /sessions/:id 200", get.status === 200 && get.json?.topic === "PID 제어 배경");
  const list = await req(base, "GET", `/sessions`, U);
  check("GET /sessions 목록 포함", Array.isArray(list.json?.items) && list.json.items.some((s) => s.session_id === sid));
  check("목록 요약(narrow 미포함·generating 플래그)", list.json.items[0] && list.json.items[0].narrow === undefined && typeof list.json.items[0].generating === "boolean");

  // 3. 담기(자산) + 목록
  const keep = await req(base, "PUT", `/sessions/${sid}/keep`, U, { keep: true, term_norm: "anti-windup", term: { term: "안티와인드업", kind: "기법", priority: 1, why: "w", one_line: "o" }, domain_tags: ["control"] });
  check("PUT keep 담기", keep.status === 200 && keep.json?.kept === true && keep.json?.asset?.term_norm === "anti-windup");
  const assets = await req(base, "GET", `/assets`, U);
  check("GET /assets 요약 포함(term_name 뽑힘)", assets.json?.items?.some((a) => a.term_norm === "anti-windup" && a.term_name === "안티와인드업"));

  // C5-S3b: domain_tags 는 서버가 세션의 area 에서 파생시킨다(G-1). 위 담기 요청은 바디에
  // domain_tags: ["control"] 을 실어 보냈다 — 그것이 **무시되는지**가 이 단언의 핵심이다.
  // 세션의 area 는 CTX 의 classify.domain 에서 왔다.
  check("담기: domain_tags 를 세션 area 에서 파생한다", JSON.stringify(keep.json?.asset?.domain_tags) === JSON.stringify([CLASSIFY.domain]),
    `실제=${JSON.stringify(keep.json?.asset?.domain_tags)} 기대=${JSON.stringify([CLASSIFY.domain])}`);
  check("담기: 요청 바디의 domain_tags 는 무시된다(음성)", !(keep.json?.asset?.domain_tags ?? []).includes("control"));

  // area 가 없는 세션에서는 빈 배열이다(G-3). topic 으로 대체하지 않는다 —
  // 자유 문장이라 같은 분야를 다르게 적으면 교차 연결이 오히려 끊긴다.
  const sidNoArea = crypto.randomUUID();
  await req(base, "PUT", `/sessions/${sidNoArea}`, U, {
    topic: "분야 없는 세션", area: null, domain_risk: "low", job_type: [], gap_type: null,
    user_condition: null, context_object: null, narrow: null, generated: null, primer: null,
    project_id: null, pinned: false, created_at: Date.now(),
  });
  const keepNoArea = await req(base, "PUT", `/sessions/${sidNoArea}/keep`, U, {
    keep: true, term_norm: "no-area", term: { term: "분야없음", kind: "개념", priority: 1, why: "w", one_line: "o" },
  });
  check("담기: area 가 없으면 빈 배열(음성)", JSON.stringify(keepNoArea.json?.asset?.domain_tags) === "[]",
    `실제=${JSON.stringify(keepNoArea.json?.asset?.domain_tags)}`);

  // 세션 스코프 자산 조회(C5-S3 V-18). 재개 시 담기 복원이 읽는 경로이고
  // /sessions/recent 의 담은 어휘 수도 같은 리포 조회에서 나온다. 요약이 아니라 term 전체가 온다.
  const sessionAssets = await req(base, "GET", `/sessions/${sid}/assets`, U);
  check("GET /sessions/:id/assets 200", sessionAssets.status === 200);
  check("세션 자산에 term 전체가 실린다", sessionAssets.json?.items?.[0]?.term?.priority === 1);
  check("세션 스코프로 걸러진다", sessionAssets.json?.items?.every((a) => a.session_id === sid));

  // 재진입 카드(C5-S3 FR-707). 목록과 같은 정렬의 첫 건에 담은 어휘 수가 붙는다.
  const card = await req(base, "GET", `/sessions/recent`, U);
  check("GET /sessions/recent 200", card.status === 200);
  check("카드에 담은 어휘 수가 실린다", typeof card.json?.kept_count === "number");
  check("카드가 목록 첫 항목과 같은 세션이다", card.json?.session?.session_id === (await req(base, "GET", `/sessions`, U)).json?.items?.[0]?.session_id);

  // 4. 상세 캐시 스키마(C5-S1 E-3·E-4·E-12). **캐시 왕복(find/save)은** HTTP로 못 탄다 —
  // 캐시는 gateUserId(JWT)에 걸려 있고 이 부트는 DEV x-user-id라 신원이 null이다.
  // 그래서 캐시에 대해서는 스키마가 보장하는 것만 본다: 소유자 분리와 키 멱등, 옛 테이블의 부재.
  // 조회 목록(GET /sessions/:id/viewed)은 다르다 — resolveUserId를 쓰는 CRUD 라우트라
  // 여기서 그대로 탄다. 4-b에서 HTTP 왕복을 본다.
  const body = JSON.stringify({ what: "w", whymine: "m", how: "h", related: [], sources: [] });
  const ins = (u, key, termNorm = "anti-windup") =>
    sql.execute(
      `INSERT INTO details (user_id, session_id, term_norm, input_key, body, created_at) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id, input_key) DO NOTHING`,
      [u, sid, termNorm, key, body, Date.now()],
    );
  await ins(U, "k1");
  await ins(U, "k1"); // 같은 키 재저장은 멱등이어야 한다(E-6 주변 — created_at을 첫 조회 시각으로 남긴다)
  await ins(U2, "k1"); // 다른 사용자의 같은 키는 별개 행이다(E-4)
  const mine = await sql.query("SELECT input_key FROM details WHERE user_id = $1", [U]);
  const other = await sql.query("SELECT input_key FROM details WHERE user_id = $1", [U2]);
  check("같은 키 재저장은 행이 늘지 않는다", mine.length === 1, `rows=${mine.length}`);
  check("사용자가 다르면 같은 키도 별개 행이다", other.length === 1);
  const gone = await sql.query("SELECT to_regclass('public.knowledge') AS t");
  check("knowledge 테이블은 사라졌다(E-12)", gone[0]?.t === null, `to_regclass=${gone[0]?.t}`);

  // 4-b. 조회 목록 HTTP 왕복(C5-S2 T-8). 종착 화면 우측 패널 스코프 1의 유일한 서버 출처다.
  // 여기까지가 없으면 details 테이블에서 화면까지 오는 길에 DB 왕복 검증이 한 칸도 없다.
  await ins(U, "k2", "적분기-와인드업"); // U는 2건, U2는 1건 — 개수가 갈려야 경계가 보인다
  const viewed = await req(base, "GET", `/sessions/${sid}/viewed`, U);
  check("GET /sessions/:id/viewed 200", viewed.status === 200, `status=${viewed.status}`);
  check("조회한 어휘가 나온다", viewed.json?.items?.some((d) => d.term_norm === "anti-windup"));
  check("같은 세션의 조회 2건이 다 나온다", viewed.json?.items?.length === 2, `len=${viewed.json?.items?.length}`);
  // E-8: 목록 응답은 본문을 담지 않는다. 담기 시작하면 세션 하나가 수백 KB가 된다.
  check("목록에 상세 본문이 없다(E-8)", viewed.json?.items?.every((d) => d.body === undefined && typeof d.created_at === "number"));
  // 소유권 경계는 세션 대조가 아니라 WHERE user_id다 — 남의 세션 id를 넣어도 자기 행만 나온다.
  const viewedOther = await req(base, "GET", `/sessions/${sid}/viewed`, U2);
  check("같은 세션 id라도 남의 조회 기록은 안 보인다", viewedOther.json?.items?.length === 1, `len=${viewedOther.json?.items?.length}`);
  const viewedElse = await req(base, "GET", `/sessions/${crypto.randomUUID()}/viewed`, U);
  check("다른 세션이면 비어 있다", Array.isArray(viewedElse.json?.items) && viewedElse.json.items.length === 0);
  const viewedAnon = await req(base, "GET", `/sessions/${sid}/viewed`, null);
  check("미인증 조회 목록은 401", viewedAnon.status === 401);

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
