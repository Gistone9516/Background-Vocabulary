// 붙여넣을 본문 조립. 기본 정리와 AI 정리가 같은 함수를 쓴다.
// 서버는 구조만 주고 본문은 여기서 만든다(FR-604). 그래야 형식이나 로케일을 바꿀 때
// 서버를 다시 부르지 않고, 나중에 refined가 붙어도 같은 자리에서 흡수된다.

import type { OutputLocale, PrimerDoc, Term } from "@vock/shared";
import { isApiError } from "../../api/index.js";
import { trIn } from "../../i18n/strings.js";
import { normTerm } from "./keep.js";

// TODO(S-31): 아래 ASK와 section 라벨 5개는 아직 문자열 표 밖에 있다. 로케일을 받아도 붙여넣기
// 본문의 라벨은 한국어로 남는다. 키 6개를 신설해 4개 언어를 채우는 것이 S-31의 남은 절반이다.
const ASK = "아래 어휘는 이미 알고 있다고 두고 답해 주세요.";

export type PrimerState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; doc: PrimerDoc }
  | { phase: "locked"; message: string } // pro 전용(402). 재시도할 일이 아니라 알릴 일이다
  | { phase: "failed"; message: string };

function section(label: string, value: string | undefined): string[] {
  return value ? [`${label}: ${value}`] : [];
}

// 담은 어휘만으로 만드는 무비용 정리. 서버를 부르지 않는다.
// 로케일을 인자로 받는다 — 이 파일은 React 밖이라 useTr()이 닿지 않는다(그런 자리가 전 저장소에 4곳뿐이다).
export function buildBasicPrimer(args: { topic: string; condition?: string; kept: Term[]; locale: OutputLocale }): string {
  if (args.kept.length === 0) return trIn(args.locale, "kept_none");
  return [
    ...section("하려는 일", args.topic),
    ...section("조건", args.condition),
    "",
    ASK,
    "",
    ...args.kept.map((t) => `- ${t.term}: ${t.one_line}`),
  ].join("\n");
}

// 서버가 정리한 구조에서 만드는 본문. 값이 없는 항목은 줄 자체가 나오지 않는다.
export function buildPrimerText(doc: PrimerDoc, kept: Term[]): string {
  // 서버는 어휘를 맨 문자열로 돌려주고 카드는 괄호 원어를 달고 있다("안티와인드업" vs
  // "안티와인드업 (Anti-Windup)"). 정확 일치로 이으면 한 줄 설명이 통째로 떨어져 나간다.
  // 어휘 동일성 판단은 담기와 같은 규칙을 쓴다(K-2).
  const card = new Map(kept.map((t) => [normTerm(t.term), t]));
  const withLine = (t: string): string => {
    const hit = card.get(normTerm(t));
    // 표기는 사용자가 카드에서 본 것을 따른다.
    if (!hit) return `- ${t}`;
    return hit.one_line ? `- ${hit.term}: ${hit.one_line}` : `- ${hit.term}`;
  };
  return [
    ...section("하려는 일", doc.task_intent),
    ...section("분야", doc.area),
    ...section("조건", doc.user_condition),
    ...section("참고 맥락", doc.context_note),
    ...(doc.known_terms.length ? ["", "이미 아는 어휘", ...doc.known_terms.map(withLine)] : []),
    ...(doc.unknown_terms.length ? ["", ASK, ...doc.unknown_terms.map(withLine)] : []),
  ].join("\n");
}

// 같은 담은 어휘 조합이면 다시 부르지 않는다(P-8). 순서가 달라도 같은 조합이다.
export function primerKey(kept: Term[], condition: string): string {
  return JSON.stringify([kept.map((t) => normTerm(t.term)).sort(), condition]);
}

// 요청 실패를 화면 상태로 옮긴다. pro 전용은 재시도할 일이 아니라 알릴 일이라 따로 가른다(P-6).
export function primerFailure(e: unknown, locale: OutputLocale): PrimerState {
  if (isApiError(e) && e.kind === "pro_only") return { phase: "locked", message: e.message };
  const message = isApiError(e) && "message" in e ? e.message : trIn(locale, "refine_failed");
  return { phase: "failed", message };
}

// 화면에 붙일 본문. AI 정리가 성공했을 때만 기본 정리를 대체한다(P-7).
// 이 분기를 화면에 두면 나중에 상태가 하나 늘 때 조용히 어긋난다. 여기 한 곳에만 둔다.
export function primerBody(
  state: PrimerState | undefined,
  args: { topic: string; condition?: string; kept: Term[]; locale: OutputLocale }
): string {
  if (state?.phase === "ready") return buildPrimerText(state.doc, args.kept);
  return buildBasicPrimer(args);
}
