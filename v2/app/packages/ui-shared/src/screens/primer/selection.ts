// 종착 화면의 선택 집합. 순수 함수라 React 없이 검증된다(상태 기계 e2e와 같은 이유).
//
// 이 파일이 T-2의 실현이다. 화면이 그리는 목록과 클립보드에 담기는 문자열이 **같은 집합**에서
// 나온다 — 둘이 어긋나면 사용자가 확인할 방법이 없는 종류의 버그이고, 조립 입구를 하나로 두면
// 그 상태가 아예 표현되지 않는다(DG-3: 검사보다 불가능이 낫다).

import type { Term } from "@vock/shared";
import { normTerm } from "@vock/shared";

// 패널에 뜨는 어휘 한 장. 어디서 왔는지를 함께 들고 다닌다 — 기본 포함 여부가 출처로 갈린다(T-13).
export interface SourceTerm {
  term: Term;
  // 둘 다 참일 수 있다. 펼치고 담았으면 조회이자 저장이다(C5-S1 E-1).
  kept: boolean;
  viewed: boolean;
}

export type Selection = ReadonlySet<string>; // term_norm 집합

// 처음 열었을 때 들어가 있는 것: **저장한 어휘만**(T-13).
// 담기는 "내 작업에 필요하다"는 명시적 판단이고 조회는 "찾아봤다"까지다. 기본값을 행동의 세기에
// 맞추면 대개 사용자는 아무것도 안 해도 된다 — 판단 0회가 목표다.
export function initialSelection(sources: readonly SourceTerm[]): Selection {
  return new Set(sources.filter((s) => s.kept).map((s) => normTerm(s.term.term)));
}

export function toggle(sel: Selection, termName: string): Selection {
  const key = normTerm(termName);
  const next = new Set(sel);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  return next;
}

export function isSelected(sel: Selection, termName: string): boolean {
  return sel.has(normTerm(termName));
}

// 복사 본문에 들어갈 어휘. **priority 오름차순**(T-14).
// 클릭 순서로 두면 같은 어휘 집합인데도 조작 이력에 따라 붙여넣는 글이 달라진다.
// priority가 같으면 이름으로 갈라 순서를 결정적으로 만든다 — 정렬이 불안정하면 같은 입력이
// 다른 출력을 내고, 그것은 e2e가 잡을 수 없는 종류의 흔들림이다.
export function selectedTerms(sources: readonly SourceTerm[], sel: Selection): Term[] {
  return sources
    .filter((s) => sel.has(normTerm(s.term.term)))
    .map((s) => s.term)
    .sort((a, b) => a.priority - b.priority || a.term.localeCompare(b.term));
}

// 담은 어휘와 조회 기록을 패널 재료 한 벌로 합친다.
// 조회는 term_norm만 오므로(서버가 body를 안 준다, T-8) 이름은 이번 세션에서 생성된 카드에서
// 잇는다. 카드가 없는 조회 기록은 표시할 이름이 없어 버린다 — 이름을 지어내면 그 순간
// 같은 어휘에 표기가 둘이 된다.
export function buildSources(args: {
  kept: readonly Term[];
  viewedNorms: readonly string[];
  generated: readonly Term[];
}): SourceTerm[] {
  const byNorm = new Map<string, SourceTerm>();
  for (const t of args.kept) {
    byNorm.set(normTerm(t.term), { term: t, kept: true, viewed: false });
  }
  const cards = new Map(args.generated.map((t) => [normTerm(t.term), t]));
  for (const norm of args.viewedNorms) {
    const hit = byNorm.get(norm);
    if (hit) {
      hit.viewed = true;
      continue;
    }
    const card = cards.get(norm);
    if (card) byNorm.set(norm, { term: card, kept: false, viewed: true });
  }
  return [...byNorm.values()].sort((a, b) => a.term.priority - b.term.priority || a.term.term.localeCompare(b.term.term));
}
