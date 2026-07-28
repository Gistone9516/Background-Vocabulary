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

const CFG = { narrowMin: 3, narrowMax: 8 };

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
  check("B-11 되돌리기 1회는 첫 질문으로", once.s.ctx.answers.length === 0 && once.s.ctx.usedUndo === true);
  const twice = drive([...answerTurn(), { t: "undo" }], CFG, once.s);
  check("B-11 두 번째 되돌리기는 무시", twice.s.ctx.answers.length === 1);
}

// D-1 되돌려도 쓴 예산은 돌아오지 않는다
{
  const base = drive([SUBMIT, classified(p1()), ...answerTurn(), ...answerTurn()]);
  const before = turnsLeft(base.s.ctx, CFG.narrowMax);
  const after = drive([{ t: "undo" }], CFG, base.s);
  check(
    "D-1 되돌린 뒤 남은 턴은 복구되지 않음",
    turnsLeft(after.s.ctx, CFG.narrowMax) === CFG.narrowMax && before === CFG.narrowMax - 2,
    `before=${before}`
  );
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
  const cfg = { narrowMin: 99, narrowMax: 3 };
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
  const cfg = { narrowMin: 3, narrowMax: 3 };
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

if (failures) {
  console.error(`\n좁히기 상태 기계 검증 실패: ${failures}건`);
  process.exit(1);
}
console.log("\n좁히기 상태 기계 검증 통과: 전이 규칙 무회귀.");
