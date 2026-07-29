// 세션 저장·재개 검증(C3 S5-1). 변환이 순수 함수라 서버도 브라우저도 필요 없다.
import {
  toSnapshot,
  fromSnapshot,
  toSessionRec,
  reduceNarrow,
  reduceTerms,
  initialTerms,
  turnsLeft,
  realAnswers,
  detailInputOf,
  limitsFor,
  FALLBACK_LIMITS,
} from "@vock/ui-shared";
import { isSessionSummary, isPage } from "@vock/shared";

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

const CLASSIFY = {
  domain: "pid_control",
  job_type: ["이해학습"],
  condition_required: false,
  question: "어느 쪽을 먼저 이해하고 싶으세요?",
  choices: [{ label: "제어기가 흔들리는 이유" }, { label: "튜닝 감각 잡기" }],
  search_locale: "en",
  domain_risk: "low",
};

const CTX = {
  sessionId: "s1",
  topic: "PID 튜닝",
  cond: "실무 중심",
  classifyOut: CLASSIFY,
  firstQuestion: { question: CLASSIFY.question, choices: CLASSIFY.choices },
  // 한 턴에 두 개를 골랐다. 라벨 수가 아니라 턴 수가 예산을 깎는다.
  answers: [{ kind: "picks", labels: ["제어기가 흔들리는 이유", "튜닝 감각 잡기"] }, { kind: "tooHard" }],
  simplify: true,
  usedUndo: true,
  confidence: 0.72,
};

const CUR = { question: "구체적으로 어떤 상황인가요?", choices: [{ label: "적분이 쌓이는 경우" }] };

console.log("세션 저장과 재개 검증:");

// S-20 왕복 무손실
{
  const snap = toSnapshot(CTX, CUR);
  const rec = { ...toSessionRec({ ctx: CTX, narrow: snap, generated: null, prev: null, now: 1000 }), user_id: "u1" };
  const back = fromSnapshot(rec, snap);

  check("분류 결과가 보존된다", back.classifyOut.search_locale === "en" && back.classifyOut.domain === "pid_control");
  check("첫 질문이 보존된다", back.firstQuestion.question === CLASSIFY.question);
  check("되돌리기 사용 여부가 보존된다", back.usedUndo === true);
  check("난이도 신호가 보존된다", back.simplify === true);
  check("확신도가 보존된다", back.confidence === 0.72);
  check("주제와 조건이 보존된다", back.topic === "PID 튜닝" && back.cond === "실무 중심");
  check("세션 id가 보존된다", back.sessionId === "s1");
}

// S-23 답변 형태는 변환하지 않는다
{
  const snap = toSnapshot(CTX, CUR);
  const rec = { ...toSessionRec({ ctx: CTX, narrow: snap, generated: null, prev: null, now: 1 }), user_id: "u1" };
  const back = fromSnapshot(rec, snap);
  check("한 턴에 두 개를 골라도 한 턴이다", realAnswers(back.answers) === 1, `count=${realAnswers(back.answers)}`);
  check("어려워요는 턴으로 세지 않는다", back.answers.length === 2 && realAnswers(back.answers) === 1);
  check("왕복해도 남은 턴이 그대로다", turnsLeft(back, 3) === turnsLeft(CTX, 3));
  check("답변이 같은 형태로 돌아온다", JSON.stringify(back.answers) === JSON.stringify(CTX.answers));
}

// S-4 파생값은 저장하지 않는다
{
  const snap = toSnapshot(CTX, CUR);
  const keys = Object.keys(snap);
  check("스냅샷에 남은 턴 필드가 없다", !keys.some((k) => /turns|remain|budget|left/i.test(k)), keys.join(","));
  const rec = toSessionRec({ ctx: CTX, narrow: snap, generated: null, prev: null, now: 1 });
  check("레코드에도 남은 턴 필드가 없다", !Object.keys(rec).some((k) => /turns|remain|budget|left/i.test(k)));
}

// S-21 컬럼은 classify에서 파생한다
{
  const rec = toSessionRec({ ctx: CTX, narrow: toSnapshot(CTX, CUR), generated: null, prev: null, now: 1 });
  check("area는 분류 domain에서 온다", rec.area === "pid_control");
  check("domain_risk는 분류에서 온다", rec.domain_risk === "low");
  check("job_type은 분류에서 온다", JSON.stringify(rec.job_type) === JSON.stringify(["이해학습"]));
  check("user_id는 클라가 보내지 않는다", !("user_id" in rec));

  // 컬럼이 어긋나 있어도 재개는 classify만 읽는다.
  const snap = toSnapshot(CTX, CUR);
  const stale = { ...rec, user_id: "u1", area: "엉뚱한 값", domain_risk: "high", user_condition: "실무 중심" };
  const back = fromSnapshot(stale, snap);
  check("재개는 어긋난 컬럼을 무시한다", back.classifyOut.domain === "pid_control" && back.classifyOut.domain_risk === "low");
}

// S-5 생성 완료는 narrow를 지운다
{
  const done = toSessionRec({ ctx: CTX, narrow: null, generated: [{ term: "적분 와인드업" }], prev: null, now: 5 });
  check("완료 시 narrow가 null이다", done.narrow === null);
  check("완료 시 생성 목록이 담긴다", Array.isArray(done.generated) && done.generated.length === 1);
}

// S-22 전체 upsert라 남의 소관 필드를 지킨다
{
  const prev = {
    session_id: "s1",
    user_id: "u1",
    topic: "PID 튜닝",
    area: "pid_control",
    domain_risk: "low",
    job_type: ["이해학습"],
    gap_type: ["a"],
    user_condition: null,
    context_object: "첨부한 문서",
    narrow: null,
    generated: [{ term: "기존 어휘" }],
    primer: { locale: "ko", area: "제어", task_intent: "", known_terms: [], unknown_terms: [] },
    project_id: "p1",
    pinned: true,
    deleted_at: null,
    created_at: 100,
    updated_at: 200,
  };
  const next = toSessionRec({ ctx: CTX, narrow: toSnapshot(CTX, CUR), generated: null, prev, now: 999 });
  check("프라이머가 지워지지 않는다", next.primer !== null);
  check("프로젝트 배속이 지워지지 않는다", next.project_id === "p1");
  check("핀이 지워지지 않는다", next.pinned === true);
  check("첨부 맥락이 지워지지 않는다", next.context_object === "첨부한 문서");
  check("생성 목록이 지워지지 않는다", next.generated !== null);
  check("생성 시각은 처음 값을 유지한다", next.created_at === 100);
  check("수정 시각은 갱신된다", next.updated_at === 999);
}

// S-6 재개는 분류를 다시 부르지 않는다
{
  const [state, cmds] = reduceNarrow({ phase: "idle" }, { t: "resume", ctx: CTX, question: CUR }, { narrowMin: 3, narrowMax: 3 });
  check("재개는 바로 질문 화면이다", state.phase === "asking" && state.question.question === CUR.question);
  check("재개는 분류를 호출하지 않는다", !cmds.some((c) => c.c === "callClassify"));
  check("재개는 스냅샷을 다시 저장하지 않는다", !cmds.some((c) => c.c === "saveSnapshot"));
  check("재개 맥락이 그대로 들어간다", state.ctx.classifyOut.search_locale === "en");
}

// FR-702 생성까지 끝난 세션 되살리기
{
  const [state, cmds] = reduceTerms(
    initialTerms,
    { t: "restore", items: [{ term: "적분 와인드업" }, { term: "안티와인드업" }] },
    { maxTotal: 8 }
  );
  check("되살린 세션은 완료 상태다", state.phase === "settled" && state.reason === "done");
  check("되살린 카드에 id가 붙는다", state.items.every((t) => typeof t.id === "string" && t.id.length > 0));
  check("되살린 카드 id가 서로 다르다", new Set(state.items.map((t) => t.id)).size === 2);
  check("되살리기는 스트림을 열지 않는다", !cmds.some((c) => c.c === "openStream"));
  check("되살리기는 완료 저장을 다시 내지 않는다", !cmds.some((c) => c.c === "completeSession"));
}

// 목록 응답 형태 검사
{
  const ok = {
    session_id: "s1",
    topic: "t",
    area: null,
    domain_risk: "low",
    project_id: null,
    pinned: false,
    generating: true,
    created_at: 1,
    updated_at: 2,
  };
  const page = isPage(isSessionSummary);
  check("온전한 목록은 통과한다", page({ items: [ok], nextCursor: null }));
  check("커서 문자열도 통과한다", page({ items: [], nextCursor: "abc" }));
  check("항목 형태가 어긋나면 거부한다", !page({ items: [{ session_id: 1 }], nextCursor: null }));
  check("items가 없으면 거부한다", !page({ nextCursor: null }));
  check("커서가 숫자면 거부한다", !page({ items: [], nextCursor: 3 }));
}

// B-1 연결 턴 산출물(S-20 "재개에 필요한 것을 전부 담는다", S3b connection_hint)
{
  const withConn = { ...CTX, connection: "예산 배분" };
  const snap = toSnapshot(withConn, CUR);
  const rec = { ...toSessionRec({ ctx: withConn, narrow: snap, generated: null, prev: null, now: 1 }), user_id: "u1" };
  const back = fromSnapshot(rec, snap);
  check("연결 턴의 답이 스냅샷에 담긴다", back.connection === "예산 배분", `connection=${back.connection}`);

  const req = detailInputOf({ id: "t1", term: "안티와인드업", kind: "기법" }, withConn);
  check("연결 턴의 답이 상세 요청에 실린다", req.connection_hint === "예산 배분", `hint=${req.connection_hint}`);
  const none = detailInputOf({ id: "t1", term: "x", kind: "개념" }, CTX);
  check("연결 턴이 없으면 상세 요청에도 없다", none.connection_hint === undefined);
}

// A-2 티어별 한도 (S2 B-4 narrowMax[tier], S3 R-5 maxTotal[tier])
{
  const cfg = { narrowMin: 3, narrowMax: { free: 3, paid: 8 }, maxTotal: { free: 8, paid: 32 } };
  const free = limitsFor(cfg, "free");
  const paid = limitsFor(cfg, "paid");
  check("free는 free 한도를 받는다", free.narrowMax === 3 && free.maxTotal === 8);
  check("paid는 paid 한도를 받는다", paid.narrowMax === 8 && paid.maxTotal === 32, JSON.stringify(paid));
  check("narrowMin은 티어와 무관하다", free.narrowMin === 3 && paid.narrowMin === 3);
  check("설정을 못 받으면 임시값으로 떨어진다", limitsFor(null, "paid").narrowMax === FALLBACK_LIMITS.narrowMax);
}

if (failures) {
  console.error(`\n세션 검증 실패: ${failures}건`);
  process.exit(1);
}
console.log("\n세션 검증 통과.");
