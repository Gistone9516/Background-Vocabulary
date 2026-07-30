// 좁히기 상태 기계 검증(C3 S2). 네트워크도 브라우저도 없이 전이 규칙만 돌린다.
// v1은 이 판정들이 컴포넌트 안에 흩어져 있어 검증할 수 없었다. 각 케이스는 스펙의 규칙 ID를 가리킨다.
// 빌드 산출물(dist)을 소비하므로 실행 전 `pnpm build`가 선행되어야 한다(gate 스크립트가 보장).
import { reduceNarrow as reduce, initialNarrow, realAnswers, turnsLeft } from "@vock/ui-shared";

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

// 탈출구 라벨은 cfg로 들어온다(S-34). 여기 한국어를 적어 두면 "라벨이 한국어일 때만 통과하는"
// 테스트가 되므로, 아래 연결 턴 검증은 일부러 한국어가 아닌 라벨로도 돌린다.
const CFG = { narrowMin: 3, narrowMax: 8, noRelationLabel: "관련 없어요" };

function p1(extra = {}) {
  return {
    domain: "요리",
    job_type: ["학습"],
    condition_required: false,
    question: "무엇부터 알고 싶나요?",
    choices: [{ label: "재료" }, { label: "도구" }],
    search_locale: "ko",
    domain_risk: "normal",
    ...extra,
  };
}
function p2(extra = {}) {
  return { question: "다음 질문", choices: [{ label: "a" }, { label: "b" }], enough: false, confidence: 0.4, ...extra };
}

const runOf = (s) => ("runId" in s ? s.runId : 0);

// 이벤트를 순서대로 먹이고 마지막 상태와 그동안 나온 명령을 모아 준다.
function drive(events, cfg = CFG, start = initialNarrow) {
  let s = start;
  const cmds = [];
  for (const mk of events) {
    const e = typeof mk === "function" ? mk(s) : mk;
    const [ns, cs] = reduce(s, e, cfg);
    s = ns;
    cmds.push(...cs);
  }
  return { s, cmds };
}

const SUBMIT = { t: "submit", sessionId: "sess-1", raw: "빵 만들기", cond: "" };
const classified = (out) => (s) => ({ t: "classified", runId: runOf(s), out });
const advanced = (out) => (s) => ({ t: "advanced", runId: runOf(s), out });
const failedWith = (error) => (s) => ({ t: "failed", runId: runOf(s), error });
// 한 턴을 답하고 다음 질문까지 받는다.
const answerTurn = (out = p2()) => [{ t: "toggle", label: "재료" }, { t: "confirm" }, advanced(out)];

console.log("좁히기 상태 기계 검증:");

// B-1 분류 중 재제출은 전이가 없다
{
  const a = drive([SUBMIT]);
  const [s2, cs2] = reduce(a.s, SUBMIT, CFG);
  check("B-1 분류 중 재제출은 상태 불변, 명령 0개", s2 === a.s && cs2.length === 0);
}

// B-2 고위험은 세션도 과금도 만들지 않는다
{
  const { s, cmds } = drive([SUBMIT, classified(p1({ domain_risk: "high" }))]);
  check("B-2 고위험은 goRefusal", cmds.some((c) => c.c === "goRefusal") && s.phase === "idle");
  check("B-2 고위험은 스냅샷 저장 없음", !cmds.some((c) => c.c === "saveSnapshot"));
}

// B-5 첫 질문 형태가 깨지면 좁히기를 건너뛴다
{
  const { s, cmds } = drive([SUBMIT, classified(p1({ choices: [] }))]);
  const handoff = cmds.find((c) => c.c === "goHandoff");
  check("B-5 분류 형태 깨짐은 곧장 넘김", s.phase === "done" && handoff && handoff.reason === "malformed");
}

// B-8 자기 요청이 아닌 응답은 버린다
{
  const a = drive([SUBMIT]);
  const [s2, cs2] = reduce(a.s, { t: "classified", runId: runOf(a.s) + 99, out: p1() }, CFG);
  check("B-8 runId 불일치 응답은 상태 불변, 명령 0개", s2 === a.s && cs2.length === 0);
}

// B-10 칩 선택과 직접 입력을 합산한다
{
  const { s } = drive([
    SUBMIT,
    classified(p1()),
    { t: "toggle", label: "재료" },
    { t: "toggle", label: "도구" },
    { t: "custom", text: "  발효  " },
    { t: "confirm" },
  ]);
  const last = s.ctx.answers[s.ctx.answers.length - 1];
  check("B-10 칩 2개와 직접 입력이 합산", last.kind === "picks" && last.labels.length === 3 && last.labels[2] === "발효");
}

// B-16 고른 것이 없으면 진행하지 않는다
{
  const a = drive([SUBMIT, classified(p1())]);
  const [s2, cs2] = reduce(a.s, { t: "confirm" }, CFG);
  check("B-16 선택 없이 확정은 전이 없음", s2 === a.s && cs2.length === 0);
}

// B-11 되돌리기는 1회
{
  const base = drive([SUBMIT, classified(p1()), ...answerTurn(), ...answerTurn()]);
  const once = drive([{ t: "undo" }], CFG, base.s);
  // 규칙을 검사한다. answers 배열의 길이는 구현 형태이지 규칙이 아니다 —
  // 길이 0을 "회귀했다"의 대용으로 쓰면 배열을 비우는 구현만 통과하고, 비우는 것이 곧 예산 환불이었다.
  check("B-11 되돌리기는 첫 질문으로 회귀한다", once.s.phase === "asking" && once.s.question === once.s.ctx.firstQuestion);
  check("B-11 되돌리면 되돌리기를 썼다고 표시된다", once.s.ctx.usedUndo === true);
  check("B-11 되돌린 답은 히스토리에서 빠진다", once.s.ctx.answers.every((a) => a.kind !== "picks"));
  const twice = drive([...answerTurn(), { t: "undo" }], CFG, once.s);
  check("B-11 두 번째 되돌리기는 아무 일도 하지 않는다", twice.s.ctx.answers.some((a) => a.kind === "picks"));
}

// D-1 되돌려도 쓴 예산은 돌아오지 않는다
{
  const base = drive([SUBMIT, classified(p1()), ...answerTurn(), ...answerTurn()]);
  const before = turnsLeft(base.s.ctx, CFG.narrowMax);
  const after = drive([{ t: "undo" }], CFG, base.s);
  // 스펙 원문(B-11): "되돌리기는 세션당 1회이고 첫 질문으로 회귀한다. 쓴 예산은 복구하지 않는다"
  // 이 문장에서 나오는 단언은 하나뿐이다 — 되돌린 뒤 남은 턴이 되돌리기 전과 같아야 한다.
  const after2 = turnsLeft(after.s.ctx, CFG.narrowMax);
  check(
    "B-11 되돌려도 쓴 예산은 복구되지 않는다",
    after2 === before,
    `되돌리기 전 ${before} -> 후 ${after2}`
  );
  check("B-11 되돌리면 첫 질문으로 간다", after.s.phase === "asking" && after.s.question === after.s.ctx.firstQuestion);
  check("B-11 되돌린 뒤 히스토리는 비어 있다", after.s.ctx.answers.every((a) => a.kind !== "picks"));
}

// D-2 난이도 신호는 질문 횟수도 예산도 쓰지 않는다
{
  const { s } = drive([SUBMIT, classified(p1()), { t: "tooHard" }, { t: "confirm" }, advanced(p2())]);
  check("D-2 어려워요 턴은 실답변 0", realAnswers(s.ctx.answers) === 0);
  check("D-2 어려워요 턴은 남은 턴 불변", turnsLeft(s.ctx, CFG.narrowMax) === CFG.narrowMax);
  check("D-2 어려워요는 쉬운 모드를 켠다", s.ctx.simplify === true);
  check("D-2 어려워요는 서버로 보내지 않는다", s.ctx.answers.length === 1 && s.ctx.answers[0].kind === "tooHard");
}

// D-5 쉬운 모드가 켜지면 어려워요는 전이가 없다
{
  const base = drive([SUBMIT, classified(p1()), { t: "tooHard" }, { t: "confirm" }, advanced(p2())]);
  const [s2, cs2] = reduce(base.s, { t: "tooHard" }, CFG);
  check("D-5 쉬운 모드에서 어려워요는 전이 없음", s2 === base.s && cs2.length === 0);
}

// B-15 일반 선택과 난이도 신호는 배타
{
  const { s } = drive([SUBMIT, classified(p1()), { t: "tooHard" }, { t: "toggle", label: "재료" }]);
  check("B-15 일반 선택이 난이도 신호를 푼다", s.picks.tooHard === false && s.picks.selected.length === 1);
}

// 종료 판정
{
  const { s } = drive([SUBMIT, classified(p1()), ...answerTurn(), ...answerTurn(), ...answerTurn(p2({ enough: true }))]);
  check("종료 enough (실답변 = narrowMin)", s.phase === "done" && s.reason === "enough");
}
{
  const cfg = { narrowMin: 99, narrowMax: 3, noRelationLabel: "관련 없어요" };
  const { s } = drive([SUBMIT, classified(p1()), ...answerTurn(), ...answerTurn(), ...answerTurn()], cfg);
  check("종료 exhausted (실답변 = narrowMax)", s.phase === "done" && s.reason === "exhausted");
}
{
  const { s } = drive([SUBMIT, classified(p1()), { t: "toggle", label: "재료" }, { t: "confirm" }, advanced(p2({ choices: [] }))]);
  check("종료 malformed (다음 질문 형태 깨짐)", s.phase === "done" && s.reason === "malformed");
}
{
  const { s, cmds } = drive([SUBMIT, classified(p1()), { t: "jump" }]);
  const handoff = cmds.find((c) => c.c === "goHandoff");
  check("종료 user_jump (여기까지 보기)", s.phase === "done" && handoff && handoff.reason === "user_jump");
}
// free에서 narrowMin과 narrowMax가 같을 때 enough를 우선한다
{
  const cfg = { narrowMin: 3, narrowMax: 3, noRelationLabel: "관련 없어요" };
  const { s } = drive([SUBMIT, classified(p1()), ...answerTurn(), ...answerTurn(), ...answerTurn(p2({ enough: true }))], cfg);
  check("min과 max가 같으면 exhausted보다 enough", s.phase === "done" && s.reason === "enough");
}

// B-13 매 턴 스냅샷
{
  const { cmds } = drive([SUBMIT, classified(p1()), ...answerTurn(), ...answerTurn()]);
  check("B-13 스냅샷은 0답 포함 매 턴 1회", cmds.filter((c) => c.c === "saveSnapshot").length === 3);
}

// B-14 주간 소진은 진입으로 되돌린다
{
  const { s, cmds } = drive([SUBMIT, failedWith({ kind: "weekly_exhausted", message: "다 썼어요" })]);
  check("B-14 주간 소진은 goEntryWithNotice", cmds.some((c) => c.c === "goEntryWithNotice") && s.phase === "idle");
}

// D-7 일시적 실패는 좁히기를 끝내지 않는다
{
  const base = drive([SUBMIT, classified(p1()), { t: "toggle", label: "재료" }, { t: "confirm" }]);
  const failed = drive([failedWith({ kind: "network" })], CFG, base.s);
  check(
    "D-7 네트워크 실패는 제자리에 머문다",
    failed.s.phase === "failed" && failed.cmds.length === 0,
    `phase=${failed.s.phase}`
  );
  const retried = drive([{ t: "retry" }], CFG, failed.s);
  const call = retried.cmds.find((c) => c.c === "callNext");
  check("D-7 재시도는 같은 답변으로 다시 부른다", !!call && realAnswers(retried.s.ctx.answers) === 1);
}

// D-6 화면을 떠나면 실제로 취소한다
{
  const base = drive([SUBMIT]);
  const left = drive([{ t: "leave" }], CFG, base.s);
  check("D-6 이탈 시 abort 명령", left.cmds.some((c) => c.c === "abort") && left.s.phase === "idle");
}

// D-4 불변식. 저장하지 않으므로 어긋날 수 없다
{
  const { s } = drive([
    SUBMIT,
    classified(p1()),
    { t: "tooHard" },
    { t: "confirm" },
    advanced(p2()),
    ...answerTurn(),
    ...answerTurn(),
  ]);
  const n = realAnswers(s.ctx.answers);
  check("D-4 불변식 실답변 + 남은턴 = narrowMax", n + turnsLeft(s.ctx, CFG.narrowMax) === CFG.narrowMax, `n=${n}`);
}

// ── 연결 턴(S5 S-11~S-14) ─────────────────────────────
{
  const CFG_C = { narrowMin: 3, narrowMax: 3, connect: true, noRelationLabel: "관련 없어요" };
  // 3답을 채워 종료 조건을 만든 뒤 연결 턴이 끼는지 본다.
  const ctx = {
    sessionId: "s", topic: "t", cond: "", classifyOut: p1(),
    firstQuestion: { question: p1().question, choices: p1().choices },
    answers: [{ kind: "picks", labels: ["a"] }, { kind: "picks", labels: ["b"] }, { kind: "picks", labels: ["c"] }],
    simplify: false, usedUndo: false, confidence: 0.9,
  };
  const advancing = { phase: "advancing", runId: 3, ctx, question: { question: "q", choices: [] } };
  const [st, cmds] = reduce(advancing, { t: "advanced", runId: 3, out: p2({ enough: true, confidence: 0.9 }) }, CFG_C);
  check("S-11 연결 턴을 켜면 종료 대신 조회로 간다", st.phase === "relating" && cmds.some((c) => c.c === "callRelate"));
  check("S-11 조회 중에는 아직 넘기지 않는다", !cmds.some((c) => c.c === "goHandoff"));

  // 관련 없음 → 원래 사유로 종료
  const [skip, skipCmds] = reduce(st, { t: "related", runId: 3, out: { relevant: false, question: "", choices: [], related_terms: [] } }, CFG_C);
  check("S-12 관련 없으면 그대로 끝난다", skip.phase === "done" && skipCmds.some((c) => c.c === "goHandoff"));

  // 실패 → 같은 길
  const [fail, failCmds] = reduce(st, { t: "related", runId: 3, out: null }, CFG_C);
  check("S-12 실패도 같은 길로 끝난다", fail.phase === "done" && failCmds.some((c) => c.c === "goHandoff"));
  check("S-12 실패가 재시도 화면을 만들지 않는다", fail.phase !== "failed");

  // 관련 있음 → 질문 한 번 더 + 탈출구
  const [ask] = reduce(st, { t: "related", runId: 3, out: { relevant: true, question: "어느 쪽과 이어지나요?", choices: [{ label: "예산 배분" }], related_terms: ["예산"] } }, CFG_C);
  check("S-11 관련 있으면 질문이 한 번 더 뜬다", ask.phase === "asking" && ask.connect !== undefined);
  // 라벨 문자열로 단언하지 않는다(S-34). 라벨은 로케일마다 다르고, 문자열을 단언하면 이 테스트가
  // "한국어일 때만 통과하는" 테스트가 된다.
  check("S-13 탈출구가 표식과 함께 붙는다", ask.question.choices.filter((c) => c.escape === true).length === 1);
  check("S-34 탈출구 라벨은 cfg가 준 것이다", ask.question.choices.find((c) => c.escape)?.label === CFG_C.noRelationLabel);
  check("S-34 서버 선택지에는 표식이 없다", ask.question.choices.filter((c) => !c.escape).every((c) => c.escape === undefined));
  check("연결 턴은 답변 예산을 쓰지 않는다", realAnswers(ask.ctx.answers) === 3);

  // 연결 답 확정 → connection 기록 후 종료
  const picked = { ...ask, picks: { selected: ["예산 배분"], custom: "", tooHard: false } };
  const [after, afterCmds] = reduce(picked, { t: "confirm" }, CFG_C);
  check("연결 답이 확정되면 끝난다", after.phase === "done" && afterCmds.some((c) => c.c === "goHandoff"));
  check("고른 방향이 맥락에 남는다", after.ctx.connection === "예산 배분");
  check("연결 답도 예산을 쓰지 않는다", realAnswers(after.ctx.answers) === 3);

  // 탈출구를 고르면 연결로 치지 않는다. 고른 라벨은 화면에 실제로 렌더된 것에서 가져온다.
  const escLabel = ask.question.choices.find((c) => c.escape).label;
  const escaped = { ...ask, picks: { selected: [escLabel], custom: "", tooHard: false } };
  const [esc] = reduce(escaped, { t: "confirm" }, CFG_C);
  check("S-13 탈출구를 고르면 연결이 기록되지 않는다", esc.phase === "done" && esc.ctx.connection === undefined);

  // ★ S-34 회귀 방지. 라벨을 한국어가 아닌 것으로 바꿔도 탈출 판정이 그대로 동작해야 한다.
  // 예전 구현은 모듈 상수 "관련 없어요"와 비교했으므로 이 케이스에서 탈출이 연결로 기록됐다.
  {
    const EN = { ...CFG_C, noRelationLabel: "Not related" };
    const [askEn] = reduce(st, { t: "related", runId: 3, out: { relevant: true, question: "Which one?", choices: [{ label: "Budget split" }], related_terms: ["budget"] } }, EN);
    const enLabel = askEn.question.choices.find((c) => c.escape).label;
    check("S-34 다른 로케일 라벨도 표식이 붙는다", enLabel === "Not related");
    const [escEn] = reduce({ ...askEn, picks: { selected: [enLabel], custom: "", tooHard: false } }, { t: "confirm" }, EN);
    check("S-34 다른 로케일에서도 탈출이 연결로 기록되지 않는다", escEn.phase === "done" && escEn.ctx.connection === undefined);
    const [pickEn] = reduce({ ...askEn, picks: { selected: ["Budget split"], custom: "", tooHard: false } }, { t: "confirm" }, EN);
    check("S-34 다른 로케일에서 실제 선택은 여전히 기록된다", pickEn.ctx.connection === "Budget split");
  }

  // 연결 턴에서는 되돌리기·난이도 신호가 없다
  const [u] = reduce(ask, { t: "undo" }, CFG_C);
  check("연결 턴에서 되돌리기는 무효다", u === ask);
  const [h] = reduce(ask, { t: "tooHard" }, CFG_C);
  check("연결 턴에서 난이도 신호는 무효다", h === ask);

  // 연결 턴을 끄면 종전과 같다
  const [plain, plainCmds] = reduce(advancing, { t: "advanced", runId: 3, out: p2({ enough: true, confidence: 0.9 }) }, { narrowMin: 3, narrowMax: 3 });
  check("연결 턴을 끄면 곧장 끝난다", plain.phase === "done" && plainCmds.some((c) => c.c === "goHandoff"));
}

if (failures) {
  console.error(`\n좁히기 상태 기계 검증 실패: ${failures}건`);
  process.exit(1);
}
console.log("\n좁히기 상태 기계 검증 통과: 전이 규칙 무회귀.");
