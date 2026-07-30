// 파일 첨부 경로 검증(C4 S4 DS4-2·3·4). 서버 게이트(402)·절단·기계의 context 관통·세션 왕복.
// 음성이 절반이다: context 없는 요청 무개입, env로 끈 게이트, 재시도에서의 보존(실제로 잡은 결함의 회귀 가드).
// paid 통과 경로는 여기 없다 — JWT가 필요해 gate-db(e2e-gate)의 티어 기반과 같은 회로를 쓴다.
import { bootLocal, buildMockDeps, InMemoryCounterStore } from "@vock/local";
import { clampContext } from "@vock/http-app";
import { reduceNarrow, initialNarrow, toSessionRec, fromSnapshot, toSnapshot } from "@vock/ui-shared";
import { DEFAULT_LIMITS } from "@vock/shared";

let pass = 0;
let fail = 0;
function check(name, ok) {
  if (ok) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.error(`  FAIL  ${name}`);
  }
}

const post = (base, path, body) =>
  fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

// ── 서버: 티어 게이트(DS4-3) ────────────────────────────────────────────
{
  // counters를 주입해야 게이팅이 붙는다. authService 없음 = 전원 free — 정확히 시험 대상이다.
  const h = await bootLocal({ port: 0, deps: { ...buildMockDeps(), counters: new InMemoryCounterStore() } });
  const base = `http://127.0.0.1:${h.port}`;
  const blocked = await post(base, "/classify", { raw_input: "커피", context_object: "문서" });
  check("free + context_object → 402", blocked.status === 402);
  check("402의 코드가 PRO_ONLY다", (await blocked.json()).error === "PRO_ONLY");
  const clean = await post(base, "/classify", { raw_input: "커피" });
  check("context 없는 요청은 무개입(현행 무변화)", clean.status === 200);
  const next = await post(base, "/next", { domain: "d", job_type: [], history: [], context_object: "x" });
  check("/next도 같은 게이트를 탄다", next.status === 402);
  h.server.close();
}

// ── 서버: env가 게이트를 끈다(TR-06 — 정본은 C5, 값은 env) ──────────────
{
  const limits = { ...DEFAULT_LIMITS, attachRequiresPro: false };
  const h = await bootLocal({ port: 0, deps: { ...buildMockDeps(), counters: new InMemoryCounterStore(), limits } });
  const base = `http://127.0.0.1:${h.port}`;
  const ok = await post(base, "/classify", { raw_input: "커피", context_object: "문서" });
  check("attachRequiresPro=false → free도 통과", ok.status === 200);
  const cfg = await (await fetch(`${base}/config`)).json();
  check("/config가 같은 값을 클라에 알린다", cfg.attachRequiresPro === false);
  h.server.close();
}

// ── 서버: 절단(DS4-2). 목 LLM은 입력을 무시하므로 절단 함수를 직접 단정한다 ──
{
  const long = "가".repeat(50);
  const cut = clampContext({ context_object: long }, 10);
  check("초과 context는 max로 잘린다", cut.context_object === "가".repeat(10));
  const keep = clampContext({ context_object: "짧다" }, 10);
  check("이하면 원문 그대로다", keep.context_object === "짧다");
  const none = clampContext({ raw_input: "x" }, 10);
  check("context 없으면 몸통 불변(음성)", none.context_object === undefined && none.raw_input === "x");
}

// ── 기계: context 관통(DS4-4) ───────────────────────────────────────────
const OUT = {
  domain: "coffee",
  domain_risk: "low",
  job_type: ["카페"],
  search_locale: "ko",
  question: "무엇부터 알고 싶나요?",
  choices: [{ label: "재료" }, { label: "도구" }],
};
{
  const [s1, cmds1] = reduceNarrow(initialNarrow, { t: "submit", sessionId: "s1", raw: "커피", cond: "", context: "첨부문서" }, { narrowMin: 3, narrowMax: 3, noRelationLabel: "없음" });
  const call = cmds1.find((c) => c.c === "callClassify");
  check("classify 입력에 context_object가 실린다", call?.input?.context_object === "첨부문서");
  const [s2] = reduceNarrow(s1, { t: "classified", runId: s1.runId, out: OUT }, { narrowMin: 3, narrowMax: 3, noRelationLabel: "없음" });
  check("분류 후 ctx가 context를 든다", s2.phase === "asking" && s2.ctx.context === "첨부문서");

  // 실패 → 재시도에서 보존(구현 중 실제로 잡은 결함의 회귀 가드).
  const [f1] = reduceNarrow(s1, { t: "failed", runId: s1.runId, error: { kind: "network" } }, { narrowMin: 3, narrowMax: 3, noRelationLabel: "없음" });
  const [r1, rc] = reduceNarrow(f1, { t: "retry" }, { narrowMin: 3, narrowMax: 3, noRelationLabel: "없음" });
  const recall = rc.find((c) => c.c === "callClassify");
  check("재시도 classify에도 context가 유지된다", recall?.input?.context_object === "첨부문서" && r1.phase === "classifying");

  // 음성: context 없이 제출하면 키 자체가 없다.
  const [, cmds0] = reduceNarrow(initialNarrow, { t: "submit", sessionId: "s0", raw: "커피", cond: "" }, { narrowMin: 3, narrowMax: 3, noRelationLabel: "없음" });
  const call0 = cmds0.find((c) => c.c === "callClassify");
  check("context 없으면 입력에 키가 없다(음성)", !("context_object" in call0.input));
}

// ── 세션 왕복(DS4-4): 저장 → 재개에서 context 복원 ──────────────────────
{
  const ctx = { sessionId: "s1", topic: "커피", cond: "", context: "첨부문서", classifyOut: OUT, firstQuestion: { question: OUT.question, choices: OUT.choices }, answers: [], simplify: false, usedUndo: false, confidence: 0 };
  const rec = toSessionRec({ ctx, narrow: toSnapshot(ctx, null), projectId: null, now: 1 });
  check("세션 레코드에 context_object로 실린다", rec.context_object === "첨부문서");
  const back = fromSnapshot({ ...rec, user_id: "u1" }, rec.narrow);
  check("재개하면 ctx.context로 돌아온다", back.context === "첨부문서");
  // 음성: 첨부 없던 세션은 null 그대로.
  const ctx0 = { ...ctx, context: undefined };
  delete ctx0.context;
  const rec0 = toSessionRec({ ctx: ctx0, narrow: toSnapshot(ctx0, null), projectId: null, now: 1 });
  check("첨부 없으면 null 그대로(음성)", rec0.context_object === null);
}

if (fail > 0) {
  console.error(`첨부 e2e 실패: ${fail}건`);
  process.exit(1);
}
console.log(`첨부 e2e 통과: ${pass}건 — 402·env 스위치·절단·기계 관통·재시도 보존·세션 왕복.`);
