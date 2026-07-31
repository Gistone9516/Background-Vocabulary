// 담기와 정리 검증(C3 S4·S4b). 순수 함수라 네트워크도 브라우저도 필요 없다.
import {
  normTerm,
  isKept,
  toggleKeep,
  keptList,
  emptyKept,
  buildBasicPrimer,
  buildPrimerText,
  primerBody,
  primerFailure,
  primerKey,
} from "@vock/ui-shared";
import { isPrimerDoc } from "@vock/shared";

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

const term = (t, line = "한 줄") => ({ term: t, kind: "개념", priority: 1, why: "근거", one_line: line });

console.log("담기와 정리 검증:");

// 토글
{
  const a = toggleKeep(emptyKept, term("적분 와인드업"));
  check("담기는 집합에 들어간다", a.size === 1 && isKept(a, "적분 와인드업"));
  const b = toggleKeep(a, term("적분 와인드업"));
  check("다시 누르면 빠진다", b.size === 0);
}

// K-2 정규화 키
{
  check("괄호 원어 표기를 흡수한다", normTerm("안티와인드업 (Anti-Windup)") === normTerm("안티와인드업"));
  check("대소문자와 공백을 흡수한다", normTerm("  PID  Control ") === normTerm("pid control"));
  const a = toggleKeep(emptyKept, term("안티와인드업 (Anti-Windup)"));
  check("표기가 달라도 같은 어휘는 담긴 것으로 본다", isKept(a, "안티와인드업"));
  const b = toggleKeep(a, term("안티와인드업"));
  check("표기가 달라도 중복 담기가 안 된다", b.size === 0, `size=${b.size}`);
}

// 카드 원본 불변
{
  const t = term("적분 와인드업");
  const snapshot = JSON.stringify(t);
  const a = toggleKeep(emptyKept, t);
  check("담아도 카드 원본은 변형되지 않는다", JSON.stringify(t) === snapshot);
  check("담긴 값은 원본 그대로다", JSON.stringify(keptList(a)[0]) === snapshot);
}

// 원본 집합 불변(새 집합을 돌려준다)
{
  const a = toggleKeep(emptyKept, term("A"));
  const b = toggleKeep(a, term("B"));
  check("토글은 새 집합을 돌려준다", a.size === 1 && b.size === 2);
}

// K-5 기본 정리
{
  const empty = buildBasicPrimer({ topic: "PID", kept: [], locale: "ko" });
  check("담은 것이 없으면 빈 문자열이 아니라 안내", empty.length > 0 && empty.includes("아직 담은 어휘가 없어요"));

  const two = buildBasicPrimer({
    topic: "PID 튜닝",
    condition: "실무 중심",
    kept: [term("적분 와인드업", "적분이 쌓이는 현상"), term("안티와인드업", "그걸 막는 기법")],
    locale: "ko",
  });
  check("기본 정리에 담은 어휘가 전부 들어간다", two.includes("적분 와인드업") && two.includes("안티와인드업"));
  check("기본 정리에 한 줄 설명이 들어간다", two.includes("적분이 쌓이는 현상"));
  check("기본 정리에 맥락이 들어간다", two.includes("PID 튜닝") && two.includes("실무 중심"));
  check("사람이 못 읽는 분야 열거 키는 넣지 않는다", !two.includes("분야:"));
}

// P-3·P-5 PrimerDoc -> 붙여넣기 본문
{
  const kept = [term("적분 와인드업", "적분이 쌓이는 현상"), term("PID", "세 항으로 제어")];
  const full = buildPrimerText(
    {
      area: "제어공학",
      task_intent: "PID 튜닝",
      user_condition: "실무 중심",
      context_note: "모터 온도가 오른다",
      terms: ["PID", "적분 와인드업"],
      locale: "ko",
    },
    kept
  );
  // 지식 상태로 가르지 않는다(C5-S1). 서버가 준 순서 그대로 한 목록이다.
  check("담은 어휘가 한 목록으로 전부 들어간다", full.includes("- PID: 세 항으로 제어") && full.includes("- 적분 와인드업: 적분이 쌓이는 현상"));
  check("서버가 준 순서를 지킨다", full.indexOf("- PID") < full.indexOf("- 적분 와인드업"));
  check("항목 값이 본문에 들어간다", full.includes("분야: 제어공학") && full.includes("참고 맥락: 모터 온도가 오른다"));

  const bare = buildPrimerText(
    { area: "", task_intent: "PID 튜닝", terms: ["적분 와인드업"], locale: "ko" },
    kept
  );
  check("빈 항목은 줄 자체가 없다", !bare.includes("분야:") && !bare.includes("조건:") && !bare.includes("참고 맥락:"));
  check("어휘 목록이 비면 제목도 없다", !buildPrimerText({ area: "", task_intent: "x", terms: [], locale: "ko" }, kept).includes("아래 어휘는"));
  check("어휘 한 줄 설명을 담은 목록에서 붙인다", bare.includes("- 적분 와인드업: 적분이 쌓이는 현상"));

  const noLine = buildPrimerText(
    { area: "", task_intent: "", terms: ["처음 보는 말"], locale: "ko" },
    kept
  );
  check("담은 목록에 없는 어휘는 설명 없이 나온다", noLine.includes("- 처음 보는 말") && !noLine.includes("처음 보는 말:"));

  // 서버는 맨 문자열을, 카드는 괄호 원어를 가진다. 정확 일치로 이으면 설명이 떨어진다(K-2).
  const paren = buildPrimerText(
    { area: "", task_intent: "", terms: ["안티와인드업"], locale: "ko" },
    [term("안티와인드업 (Anti-Windup)", "적분 축적을 막는 기법")]
  );
  check("괄호 원어 표기가 달라도 한 줄 설명이 붙는다", paren.includes("적분 축적을 막는 기법"));
  check("표기는 카드에서 본 그대로 쓴다", paren.includes("- 안티와인드업 (Anti-Windup):"));
}

// P-2 기본 정리와 AI 정리가 같은 조립 규칙을 쓴다
{
  const kept = [term("적분 와인드업", "적분이 쌓이는 현상")];
  const basic = buildBasicPrimer({ topic: "PID 튜닝", kept, locale: "ko" });
  const ai = buildPrimerText({ area: "", task_intent: "PID 튜닝", terms: ["적분 와인드업"], locale: "ko" }, kept);
  const ask = "아래 어휘는 이미 알고 있다고 두고 답해 주세요.";
  check("둘 다 같은 요청 문구를 쓴다", basic.includes(ask) && ai.includes(ask));
  check("둘 다 같은 어휘 줄 형식을 쓴다", basic.includes("- 적분 와인드업: 적분이 쌓이는 현상") && ai.includes("- 적분 와인드업: 적분이 쌓이는 현상"));
  // P-4: 어휘를 다시 설명해 달라고 요구하지 않는다
  check("어휘 재설명을 요구하지 않는다", !basic.includes("설명해") && !ai.includes("설명해"));
}

// P-6·P-7 402 PRO_ONLY는 잠김이고 기본 정리는 그대로
{
  const kept = [term("적분 와인드업", "적분이 쌓이는 현상")];
  const args = { topic: "PID 튜닝", kept, locale: "ko" };
  const basic = buildBasicPrimer(args);

  const locked = primerFailure({ kind: "pro_only", message: "pro 전용 기능이에요." });
  check("402 PRO_ONLY는 잠김 상태다", locked.phase === "locked" && locked.key === "err_pro_only");
  check("잠겨도 본문은 기본 정리 그대로다", primerBody(locked, args) === basic);

  const failed = primerFailure({ kind: "network" });
  check("다른 실패는 실패 상태다", failed.phase === "failed" && failed.key === "err_network");
  check("실패해도 본문은 기본 정리 그대로다", primerBody(failed, args) === basic);

  // 형태가 어긋난 응답은 ready로 올라오면 안 된다. 렌더 도중에 터져 화면 전체가 죽는다(실측).
  check("옛 형태 응답은 PrimerDoc이 아니다", !isPrimerDoc({ area: "PID", paste_text: "…", vocab: [] }));
  check("필드가 빠지면 PrimerDoc이 아니다", !isPrimerDoc({ locale: "ko", area: "", task_intent: "" }));
  // 옛 형태(known/unknown 분리)를 그대로 받으면 terms가 undefined인 채 본문 조립이 터진다(실측).
  check("옛 분리 형태는 PrimerDoc이 아니다", !isPrimerDoc({ locale: "ko", area: "", task_intent: "", known_terms: [], unknown_terms: [] }));
  check("배열에 문자열 아닌 것이 섞이면 아니다", !isPrimerDoc({ locale: "ko", area: "", task_intent: "", terms: [1] }));
  check("온전한 형태는 통과한다", isPrimerDoc({ locale: "ko", area: "", task_intent: "", terms: [] }));
  check("형태 위반은 malformed 실패로 떨어진다", primerFailure({ kind: "malformed" }).phase === "failed");
  check("호출 전에도 본문은 기본 정리다", primerBody({ phase: "idle" }, args) === basic);
  check("부르는 중에도 본문은 기본 정리다", primerBody({ phase: "loading" }, args) === basic);

  const ready = primerBody(
    {
      phase: "ready",
      doc: { area: "제어공학", task_intent: "", terms: ["적분 와인드업"], locale: "ko" },
    },
    args
  );
  check("성공했을 때만 본문이 바뀐다", ready !== basic && ready.includes("분야: 제어공학"));
}

// P-8 같은 어휘 조합은 다시 부르지 않는다
{
  const a = term("적분 와인드업");
  const b = term("안티와인드업");
  check("순서가 달라도 같은 조합이다", primerKey([a, b], "") === primerKey([b, a], ""));
  check("표기가 달라도 같은 조합이다", primerKey([term("안티와인드업 (Anti-Windup)")], "") === primerKey([b], ""));
  check("어휘가 바뀌면 다른 조합이다", primerKey([a], "") !== primerKey([a, b], ""));
  check("조건이 바뀌면 다른 조합이다", primerKey([a], "실무 중심") !== primerKey([a], "면접 대비"));
}

if (failures) {
  console.error(`\n담기 검증 실패: ${failures}건`);
  process.exit(1);
}
console.log("\n담기 검증 통과.");
