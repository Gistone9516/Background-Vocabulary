// 붙여넣을 본문 조립. 기본 정리와 AI 정리가 같은 함수를 쓴다.
// 서버는 구조만 주고 본문은 여기서 만든다(FR-604). 그래야 형식이나 로케일을 바꿀 때
// 서버를 다시 부르지 않고, 나중에 refined가 붙어도 같은 자리에서 흡수된다.

import type { OutputLocale, PrimerDoc, Term } from "@vock/shared";
import { errorKey, isApiError } from "../../api/index.js";
import { trIn, type StringKey } from "../../i18n/strings.js";
import { normTerm } from "./keep.js";

export type PrimerState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; doc: PrimerDoc }
  // 실패는 문구가 아니라 키를 담는다(S-35). 문구를 담으면 실패 시점의 언어가 굳어서, 뒤에 언어를
  // 바꿔도 그 줄만 옛 언어로 남는다. 키를 담으면 화면이 그릴 때의 언어를 따른다.
  | { phase: "locked"; key: StringKey } // pro 전용(402). 재시도할 일이 아니라 알릴 일이다
  | { phase: "failed"; key: StringKey };

function section(label: string, value: string | undefined): string[] {
  return value ? [`${label}: ${value}`] : [];
}

// 담은 어휘만으로 만드는 무비용 정리. 서버를 부르지 않는다.
// 로케일을 인자로 받는다 — 이 파일은 React 밖이라 useTr()이 닿지 않는다(그런 자리가 전 저장소에 4곳뿐이다).
export function buildBasicPrimer(args: { topic: string; condition?: string; kept: Term[]; locale: OutputLocale }): string {
  if (args.kept.length === 0) return trIn(args.locale, "kept_none");
  const t = (k: StringKey) => trIn(args.locale, k);
  return [
    ...section(t("primer_task"), args.topic),
    ...section(t("primer_condition"), args.condition),
    "",
    t("primer_ask"),
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
  // 라벨은 UI 언어가 아니라 이 문서의 로케일을 따른다(S-31). 메인 AI에게 보낼 글이므로,
  // 화면 언어를 바꾸는 것과 붙여넣을 글의 언어를 바꾸는 것은 다른 일이다.
  const t = (k: StringKey) => trIn(doc.locale, k);
  return [
    ...section(t("primer_task"), doc.task_intent),
    ...section(t("primer_area"), doc.area),
    ...section(t("primer_condition"), doc.user_condition),
    ...section(t("primer_context"), doc.context_note),
    ...(doc.terms.length ? ["", t("primer_ask"), ...doc.terms.map(withLine)] : []),
  ].join("\n");
}

// 같은 담은 어휘 조합이면 다시 부르지 않는다(P-8). 순서가 달라도 같은 조합이다.
export function primerKey(kept: Term[], condition: string): string {
  return JSON.stringify([kept.map((t) => normTerm(t.term)).sort(), condition]);
}

// 요청 실패를 화면 상태로 옮긴다. pro 전용은 재시도할 일이 아니라 알릴 일이라 따로 가른다(P-6).
// 로케일을 받지 않는다 — 키만 정하고 문구는 화면이 그릴 때 고른다.
export function primerFailure(e: unknown): PrimerState {
  if (isApiError(e) && e.kind === "pro_only") return { phase: "locked", key: "err_pro_only" };
  // 서버가 준 종류를 문구 키로 옮긴다. 종류를 모르는 실패(네트워크 예외 등)는 정리 실패로 본다.
  return { phase: "failed", key: isApiError(e) ? errorKey(e) : "refine_failed" };
}

// 배경 브리핑 규칙 블록(C5-S2 T-7). 본문 맨 앞에 붙어 이 덩어리가 "질문"이 아니라 참고 자료임을
// 선언한다 — 맨 목록만 보내면 메인 AI가 목록 자체에 반응할 수 있다.
//
// 사전 기조(T-15)가 문면을 정한다. "이미 알고 있다"가 아니라 "인지하고 있다"이며, 담기는 학습
// 완료가 아니라 사전에 꽂아 두는 행위다. 그래서 지시가 금지("설명하지 마라")가 아니라 보정
// ("이 수준에 맞춰라")이다 — 금지만 주면 메인 AI가 어느 깊이로 가야 할지 알 수 없다.
function briefingBlock(locale: OutputLocale): string {
  const t = (k: StringKey) => trIn(locale, k);
  return [t("brief_head"), t("brief_intro"), t("brief_recognize"), t("brief_depth"), t("brief_direction")].join("\n");
}

// 화면에 붙일 본문. AI 정리가 성공했을 때만 기본 정리를 대체한다(P-7).
// 이 분기를 화면에 두면 나중에 상태가 하나 늘 때 조용히 어긋난다. 여기 한 곳에만 둔다.
export function primerBody(
  state: PrimerState | undefined,
  args: { topic: string; condition?: string; kept: Term[]; locale: OutputLocale }
): string {
  const body = state?.phase === "ready" ? buildPrimerText(state.doc, args.kept) : buildBasicPrimer(args);
  // 어휘가 하나도 없으면 본문은 안내 한 줄이다. 거기에 규칙 블록을 붙이면 안내가 묻힌다.
  if (args.kept.length === 0) return body;
  return `${briefingBlock(args.locale)}\n\n${body}`;
}
