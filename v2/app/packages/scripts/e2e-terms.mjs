// 어휘 생성 스트리밍 상태 기계 검증(C3 S3). 네트워크 없이 전이 규칙만 돌린다.
// 빌드 산출물(dist)을 소비하므로 실행 전 `pnpm build`가 선행되어야 한다(gate 스크립트가 보장).
import { reduceTerms as reduce, initialTerms, HIGH_RISK_CODE } from "@vock/ui-shared";

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

const CFG = { maxTotal: 4 };
const INPUT = { area: "요리", job_type: ["학습"], domain: "요리", topic: "빵", locale: "ko", domain_risk: "normal" };
const term = (n) => ({ type: "term", term: { term: `어휘${n}`, kind: "개념", priority: n, why: "근거", one_line: "한 줄", tag: "몰라" } });
const runOf = (s) => ("runId" in s ? s.runId : 0);

function drive(events, cfg = CFG, start = initialTerms) {
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

const START = { t: "start", input: INPUT, append: false };
const ev = (x) => (s) => ({ t: "event", runId: runOf(s), ev: x });
const fail = (error) => (s) => ({ t: "failed", runId: runOf(s), error });
const watchdog = () => (s) => ({ t: "watchdog", runId: runOf(s) });

console.log("어휘 생성 상태 기계 검증:");

// 기본 스트리밍
{
  const { s, cmds } = drive([START, ev(term(1)), ev(term(2)), ev(term(3))]);
  check("term 3건이 순서대로 쌓인다", s.phase === "streaming" && s.items.length === 3);
  check("시작 시 스트림을 연다", cmds.some((c) => c.c === "openStream"));
  check("이벤트마다 감시 시계를 되감는다", cmds.filter((c) => c.c === "armWatchdog").length === 4);
}

// done
{
  const { s, cmds } = drive([START, ev(term(1)), ev({ type: "done" })]);
  check("done은 settled(done)", s.phase === "settled" && s.reason === "done");
  check("done은 세션 완료 전이를 낸다", cmds.some((c) => c.c === "completeSession"));
}

// 이어붙이기는 완료 전이를 다시 하지 않는다
{
  const base = drive([START, ev(term(1)), ev({ type: "done" })]);
  const app = drive([{ t: "start", input: INPUT, append: true }, ev(term(2)), ev({ type: "done" })], CFG, base.s);
  check("이어붙이기는 기존 목록을 유지", app.s.items.length === 2);
  check("이어붙이기 done은 완료 전이 없음", !app.cmds.some((c) => c.c === "completeSession"));
}

// 누적 상한
{
  const { s, cmds } = drive([START, ev(term(1)), ev(term(2)), ev(term(3)), ev(term(4)), ev(term(5))]);
  check("상한에서 멈춘다", s.phase === "settled" && s.reason === "capped", `phase=${s.phase}`);
  check("상한 도달 시 정확히 maxTotal개", s.items.length === CFG.maxTotal);
  check("상한 도달은 스트림을 끊는다", cmds.some((c) => c.c === "abort"));
}
{
  const capped = drive([START, ev(term(1)), ev(term(2)), ev(term(3)), ev(term(4)), ev(term(5))]);
  const more = drive([ev(term(6))], CFG, capped.s);
  check("상한 이후 term 이벤트는 무시", more.s.items.length === CFG.maxTotal && more.cmds.length === 0);
}

// 고위험
{
  const { s, cmds } = drive([START, ev(term(1)), ev({ type: "error", code: HIGH_RISK_CODE, message: "거부" })]);
  check("고위험은 거부 화면으로", cmds.some((c) => c.c === "goRefusal"));
  check("고위험은 스트리밍을 끝낸다", s.phase !== "streaming");
}

// 일반 오류는 받은 것을 남긴다
{
  const { s } = drive([START, ev(term(1)), ev(term(2)), ev({ type: "error", code: "OOPS", message: "실패" })]);
  check("오류는 failed", s.phase === "failed");
  check("오류에도 받은 카드는 보존", s.items.length === 2);
}
{
  const { s } = drive([START, ev(term(1)), fail({ kind: "network" })]);
  check("전송 실패에도 받은 카드는 보존", s.phase === "failed" && s.items.length === 1);
}

// 새 생성은 비우고 시작하며 이전 스트림을 끊는다
{
  const base = drive([START, ev(term(1)), ev(term(2))]);
  const again = drive([START], CFG, base.s);
  check("새 생성은 목록을 비운다", again.s.items.length === 0);
  check("새 생성은 이전 스트림을 끊는다", again.cmds.some((c) => c.c === "abort"));
}

// runId 대조
{
  const base = drive([START, ev(term(1))]);
  const [s2, cs2] = reduce(base.s, { t: "event", runId: runOf(base.s) + 9, ev: term(2) }, CFG);
  check("runId 불일치 이벤트는 무시", s2 === base.s && cs2.length === 0);
}

// 감시 시계
{
  const { s, cmds } = drive([START, ev(term(1)), watchdog()]);
  check("감시 시계 만료는 settled(aborted)", s.phase === "settled" && s.reason === "aborted");
  check("감시 시계 만료도 스트림을 끊는다", cmds.some((c) => c.c === "abort"));
}

// leave
{
  const base = drive([START, ev(term(1))]);
  const left = drive([{ t: "leave" }], CFG, base.s);
  check("이탈은 idle과 abort", left.s.phase === "idle" && left.cmds.some((c) => c.c === "abort"));
}

// R-10 불변식. 어떤 종료 경로든 streaming으로 남지 않는다
{
  const enders = [
    ["done", ev({ type: "done" })],
    ["capped", null],
    ["high-risk", ev({ type: "error", code: HIGH_RISK_CODE, message: "x" })],
    ["error", ev({ type: "error", code: "X", message: "x" })],
    ["transport", fail({ kind: "network" })],
    ["watchdog", watchdog()],
    ["leave", { t: "leave" }],
  ];
  let allSettled = true;
  for (const [, endEvent] of enders) {
    const seq = endEvent
      ? [START, ev(term(1)), endEvent]
      : [START, ev(term(1)), ev(term(2)), ev(term(3)), ev(term(4)), ev(term(5))];
    const { s } = drive(seq);
    if (s.phase === "streaming") allSettled = false;
  }
  check("R-10 어떤 종료 경로든 로딩이 남지 않는다", allSettled);
}

if (failures) {
  console.error(`\n어휘 생성 상태 기계 검증 실패: ${failures}건`);
  process.exit(1);
}
console.log("\n어휘 생성 상태 기계 검증 통과: 전이 규칙 무회귀.");
