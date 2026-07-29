// 담기와 기본 정리 검증(C3 S4). 순수 함수라 네트워크도 브라우저도 필요 없다.
import { normTerm, isKept, toggleKeep, keptList, emptyKept, buildBasicPrimer } from "@vock/ui-shared";

let failures = 0;
function check(name, cond, detail) {
  if (cond) {
    console.log(`  PASS  ${name}`);
  } else {
    failures++;
    console.error(`  FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

const term = (t, line = "한 줄") => ({ term: t, kind: "개념", priority: 1, why: "근거", one_line: line, tag: "몰라" });

console.log("담기와 기본 정리 검증:");

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
  const empty = buildBasicPrimer({ topic: "PID", kept: [] });
  check("담은 것이 없으면 빈 문자열이 아니라 안내", empty.length > 0 && empty.includes("아직 담은 어휘가 없어요"));

  const two = buildBasicPrimer({
    topic: "PID 튜닝",
    condition: "실무 중심",
    kept: [term("적분 와인드업", "적분이 쌓이는 현상"), term("안티와인드업", "그걸 막는 기법")],
  });
  check("기본 정리에 담은 어휘가 전부 들어간다", two.includes("적분 와인드업") && two.includes("안티와인드업"));
  check("기본 정리에 한 줄 설명이 들어간다", two.includes("적분이 쌓이는 현상"));
  check("기본 정리에 맥락이 들어간다", two.includes("PID 튜닝") && two.includes("실무 중심"));
  check("사람이 못 읽는 분야 열거 키는 넣지 않는다", !two.includes("분야:"));
}

if (failures) {
  console.error(`\n담기 검증 실패: ${failures}건`);
  process.exit(1);
}
console.log("\n담기 검증 통과.");
