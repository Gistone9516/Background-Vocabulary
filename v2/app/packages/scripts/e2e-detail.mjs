// 카드 상세 상태 기계 검증(C3 S3b). 네트워크 없이 전이 규칙만 돌린다.
// 핵심은 무료 열람 횟수를 클라가 세지 않는다는 것이다. 소진은 서버 402로만 알 수 있다.
import { reduceDetail as reduce, initialDetail, classifyResponse, isRetryable } from "@vock/ui-shared";
import { canonicalDetailInput, detailInputKey, DETAIL_PROMPT_VERSION } from "@vock/shared";

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

const IN = { term: "적분 와인드업", kind: "현상", area: "제어", job_type: ["학습"], domain: "제어", topic: "PID", locale: "ko" };
const OUT = { what: "개념", whymine: "내 상황", how: "활용", related: [], sources: [] };
const runOf = (s) => ("runId" in s ? s.runId : 0);

function drive(events, start = initialDetail, startCache = {}) {
  let s = start;
  let cache = startCache;
  const cmds = [];
  for (const mk of events) {
    const e = typeof mk === "function" ? mk(s) : mk;
    const [ns, cs, nc] = reduce(s, e, cache);
    s = ns;
    cache = nc;
    cmds.push(...cs);
  }
  return { s, cmds, cache };
}

const open = (id) => ({ t: "toggle", id, input: IN });
const loaded = (id, out = OUT) => (s) => ({ t: "loaded", runId: runOf(s), id, out });
const failedWith = (id, error) => (s) => ({ t: "failed", runId: runOf(s), id, error });

console.log("카드 상세 상태 기계 검증:");

// 열기와 도착
{
  const a = drive([open("t1")]);
  check("카드 열기는 로딩과 호출", a.s.phase === "loading" && a.cmds.some((c) => c.c === "callDetail"));
  const b = drive([loaded("t1")], a.s, a.cache);
  check("도착하면 열린다", b.s.phase === "open");
  check("도착한 상세는 캐시에 남는다", !!b.cache["t1"]);
  check("열리면 카드를 보이게 옮긴다", b.cmds.some((c) => c.c === "revealCard"));
}

// 캐시 재사용
{
  const a = drive([open("t1"), loaded("t1")]);
  const closed = drive([{ t: "close" }], a.s, a.cache);
  const again = drive([open("t1")], closed.s, closed.cache);
  check("같은 카드를 다시 열면 호출하지 않는다", again.s.phase === "open" && !again.cmds.some((c) => c.c === "callDetail"));
}

// 한 번에 하나만
{
  const a = drive([open("t1"), loaded("t1")]);
  const b = drive([open("t2")], a.s, a.cache);
  check("다른 카드를 열면 이전은 닫힌다", b.s.id === "t2");
  check("새 카드는 새로 부른다", b.cmds.some((c) => c.c === "callDetail"));
}

// 토글
{
  const a = drive([open("t1"), loaded("t1")]);
  const b = drive([open("t1")], a.s, a.cache);
  check("열린 카드를 다시 누르면 접힌다", b.s.phase === "closed");
}

// 로딩 중 다른 카드
{
  const a = drive([open("t1")]);
  const b = drive([open("t2")], a.s, a.cache);
  check("로딩 중 다른 카드를 열면 이전 요청을 끊는다", b.cmds.some((c) => c.c === "abort"));
}

// 무료 소진과 pro 전용은 안내로 끝난다
{
  const a = drive([open("t1")]);
  const b = drive([failedWith("t1", { kind: "weekly_exhausted", message: "무료 상세 열람을 다 썼어요." })], a.s, a.cache);
  check("무료 소진은 locked", b.s.phase === "locked");
  check("무료 소진은 서버 문구를 그대로 보여준다", b.s.message === "무료 상세 열람을 다 썼어요.");
  check("무료 소진은 캐시를 더럽히지 않는다", !b.cache["t1"]);
}
{
  const a = drive([open("t1")]);
  const b = drive([failedWith("t1", { kind: "pro_only", message: "pro 전용이에요." })], a.s, a.cache);
  check("pro 전용도 locked", b.s.phase === "locked");
}

// 일시적 실패는 재시도
{
  const a = drive([open("t1")]);
  const b = drive([failedWith("t1", { kind: "network" })], a.s, a.cache);
  check("네트워크 실패는 failed", b.s.phase === "failed");
  const c = drive([{ t: "retry", input: IN }], b.s, b.cache);
  check("재시도는 다시 부른다", c.s.phase === "loading" && c.cmds.some((x) => x.c === "callDetail"));
}

// runId 대조
{
  const a = drive([open("t1")]);
  const [s2, cs2] = reduce(a.s, { t: "loaded", runId: runOf(a.s) + 5, id: "t1", out: OUT }, a.cache);
  check("runId 불일치 응답은 무시", s2 === a.s && cs2.length === 0);
}

// 닫기 중 로딩이면 끊는다
{
  const a = drive([open("t1")]);
  const b = drive([{ t: "close" }], a.s, a.cache);
  check("로딩 중 닫으면 요청을 끊는다", b.s.phase === "closed" && b.cmds.some((c) => c.c === "abort"));
}

// A-3 상세 한도 소진(S3b D-3). 서버 gating.ts가 실제로 보내는 본문을 그대로 넣는다 —
// 화면이 만들어 낸 kind로 검사하면 서버가 그 kind를 보내지 않아도 초록이 된다.
{
  const got = classifyResponse(402, { error: "DETAIL_LIMIT", message: "무료 상세 열람을 다 썼어요." });
  check("D-3 상세 한도 402는 재시도 가능한 서버 오류가 아니다", got.kind !== "server", `kind=${got.kind}`);
  check("D-3 상세 한도는 잠김으로 분류된다", got.kind === "detail_limit", `kind=${got.kind}`);
  check("D-3 상세 한도는 재시도 대상이 아니다", !isRetryable(got));

  // 분류만 맞아도 화면이 그 kind를 모르면 잠기지 않는다. 상태까지 관통시킨다.
  const a = drive([open("t1")]);
  const b = drive([failedWith("t1", got)], a.s, a.cache);
  check("D-3 상세 한도는 화면을 잠근다", b.s.phase === "locked", `phase=${b.s.phase}`);
  check("D-3 잠김에는 서버 문구가 실린다", b.s.phase === "locked" && b.s.message === "무료 상세 열람을 다 썼어요.");
}

// C5-S1 캐시 키(E-3·E-7). 서버 캐시가 무엇을 같은 요청으로 볼지 정하는 순수 함수다.
{
  const key = (o) => canonicalDetailInput({ ...IN, ...o });
  check("같은 입력은 같은 키다", key({}) === key({}));
  // whymine이 세션 맥락에 의존하므로 어휘가 같아도 topic이 다르면 다른 본문이어야 한다.
  check("topic이 다르면 키가 갈린다", key({}) !== key({ topic: "다른 주제" }));
  check("connection_hint 유무로 키가 갈린다", key({}) !== key({ connection_hint: "x" }));
  // 고른 순서는 같은 요청이다. 정렬하지 않으면 같은 화면에서 캐시가 빗나간다.
  check("job_type 순서는 키를 바꾸지 않는다", key({ job_type: ["a", "b"] }) === key({ job_type: ["b", "a"] }));
  // 길이 접두어를 쓰는 이유. 구분자였다면 아래 둘이 같은 키로 접힌다.
  check("필드 경계가 섞이지 않는다", key({ term: "xy", kind: "" }) !== key({ term: "x", kind: "y" }));
  check("프롬프트 버전이 키에 들어간다", key({}).includes(`v${DETAIL_PROMPT_VERSION}`));

  const h1 = await detailInputKey({ ...IN });
  const h2 = await detailInputKey({ ...IN, topic: "다른 주제" });
  check("해시는 64자 hex다", /^[0-9a-f]{64}$/.test(h1), h1);
  check("다른 정규 문자열은 다른 해시다", h1 !== h2);
}

if (failures) {
  console.error(`\n카드 상세 상태 기계 검증 실패: ${failures}건`);
  process.exit(1);
}
console.log("\n카드 상세 상태 기계 검증 통과: 전이 규칙 + 캐시 키 무회귀.");
