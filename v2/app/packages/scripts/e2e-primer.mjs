// 종착 화면의 선택 집합 검증(C5-S2). 순수 함수라 네트워크도 React도 없이 돈다.
// 여기서 지키는 것은 T-2다 — 화면이 그리는 목록과 클립보드 문자열이 같은 집합에서 나온다.
import { buildSources, initialSelection, isSelected, selectedTerms, toggleSelection } from "@vock/ui-shared";

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log(`  PASS  ${name}`);
  else { failures++; console.error(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

const card = (name, priority, line = "한 줄") => ({ term: name, kind: "개념", priority, why: "근거", one_line: line });

const A = card("안티와인드업 (Anti-Windup)", 2, "적분 축적을 막는다");
const B = card("PID 제어", 1, "세 항으로 제어");
const C = card("적분기 와인드업", 3, "포화에도 적분이 계속된다");

// T-13 기본 선택 = 저장분만. 조회만 한 것은 패널에서 고를 수 있되 기본은 아니다.
{
  const src = buildSources({ kept: [A, B], viewedNorms: ["적분기 와인드업"], generated: [A, B, C] });
  check("조회만 한 어휘도 패널 재료에 들어간다", src.some((s) => s.term.term === "적분기 와인드업"));
  const sel = initialSelection(src);
  check("기본 선택은 저장분뿐", sel.size === 2 && isSelected(sel, "PID 제어") && isSelected(sel, "안티와인드업 (Anti-Windup)"));
  check("조회만 한 것은 기본 미포함", !isSelected(sel, "적분기 와인드업"));
}

// 저장과 조회는 동시에 참일 수 있다(C5-S1 E-1). 한 어휘가 두 줄로 갈라지면 안 된다.
{
  const src = buildSources({ kept: [A], viewedNorms: ["안티와인드업"], generated: [A] });
  check("펼치고 담은 어휘는 한 줄이다", src.length === 1);
  check("저장이자 조회로 표시된다", src[0].kept === true && src[0].viewed === true);
}

// 이름을 이을 카드가 없는 조회 기록은 버린다 — 이름을 지어내면 같은 어휘에 표기가 둘이 된다.
{
  const src = buildSources({ kept: [], viewedNorms: ["없는어휘"], generated: [] });
  check("이름 없는 조회 기록은 버린다", src.length === 0);
}

// T-14 순서는 priority. 클릭 순서를 바꿔도 본문이 같아야 한다.
{
  const src = buildSources({ kept: [A, B, C], viewedNorms: [], generated: [A, B, C] });
  let s1 = initialSelection(src);
  s1 = toggleSelection(s1, "PID 제어");
  s1 = toggleSelection(s1, "PID 제어"); // 뺐다 다시 넣기
  const forward = selectedTerms(src, s1).map((t) => t.term);
  const s2 = toggleSelection(toggleSelection(initialSelection(src), "적분기 와인드업"), "적분기 와인드업");
  const backward = selectedTerms(src, s2).map((t) => t.term);
  check("priority 오름차순", forward[0] === "PID 제어" && forward[2] === "적분기 와인드업", forward.join(" | "));
  check("조작 이력이 달라도 같은 본문", forward.join("|") === backward.join("|"));
}

// 제거는 집합에서만 빠진다. 재료 목록은 그대로라 다시 넣을 수 있다.
{
  const src = buildSources({ kept: [A, B], viewedNorms: [], generated: [A, B] });
  const sel = toggleSelection(initialSelection(src), "PID 제어");
  check("제거하면 본문에서 빠진다", selectedTerms(src, sel).every((t) => t.term !== "PID 제어"));
  check("재료 목록에는 남는다", src.some((s) => s.term.term === "PID 제어"));
  check("다시 넣을 수 있다", selectedTerms(src, toggleSelection(sel, "PID 제어")).length === 2);
}

// 표기가 달라도 같은 어휘다(K-2). 괄호 원어를 뗀 이름으로도 눌린다.
{
  const src = buildSources({ kept: [A], viewedNorms: [], generated: [A] });
  check("괄호 원어를 뗀 표기로도 같은 어휘", isSelected(initialSelection(src), "안티와인드업"));
}

if (failures) {
  console.error(`\n종착 화면 선택 집합 검증 실패: ${failures}건`);
  process.exit(1);
}
console.log("\n종착 화면 선택 집합 검증 통과: 기본 선택·순서 결정성·표기 흡수.");
