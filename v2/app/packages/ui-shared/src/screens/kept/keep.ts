// 담기. 카드 원본을 건드리지 않고 키 집합으로만 관리한다.
// v1은 terms 배열 안에 kept 불리언을 섞어 서버가 준 값에 사용자 상태가 끼어들었다.

import type { Term } from "@vock/shared";

// 중복 담기 판정 키. 표기가 달라도 같은 어휘면 한 번만 담긴다(스펙 K-2).
// 괄호 안 원어 표기, 공백, 대소문자 차이를 흡수한다.
export function normTerm(term: string): string {
  return term
    .replace(/[（(][^)）]*[)）]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export type KeptMap = ReadonlyMap<string, Term>;

export const emptyKept: KeptMap = new Map();

export function isKept(kept: KeptMap, term: string): boolean {
  return kept.has(normTerm(term));
}

// 담겨 있으면 빼고 없으면 담는다. 원본 Term은 그대로 저장한다.
export function toggleKeep(kept: KeptMap, term: Term): KeptMap {
  const key = normTerm(term.term);
  const next = new Map(kept);
  if (next.has(key)) next.delete(key);
  else next.set(key, term);
  return next;
}

export function keptList(kept: KeptMap): Term[] {
  return [...kept.values()];
}
