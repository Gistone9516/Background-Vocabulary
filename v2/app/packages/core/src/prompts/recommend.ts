// 프롬프트3. 좁혀진 영역과 상황을 받아 우선순위 추천 어휘를 만든다. 추천 엔진(기획 P13).
// 영어 RAG 근거를 출력 언어의 말그릇으로 변환한다.

import type { Msg, JobType, GapType, OutputLocale } from "@vock/shared";
import { JOB_LIST, langInstruction, SECURITY_GUARD, JSON_ONLY } from "./blocks.js";

export function buildPrompt3(input: {
  area: string;
  job_type: JobType[];
  user_condition?: string;
  context_object?: string;
  gap_type?: GapType[];
  grounding: string; // 영어 웹 검색 근거
  exclude?: string[]; // 이미 제시한 어휘(더보기 시 제외)
  topic?: string; // 사용자 원래 요청(앵커 식별용)
  count?: number; // 추천할 어휘 개수(티어별 차등). 미지정이면 8.
  difficulty?: "기초" | "중급" | "심화"; // 사용자가 고른 어휘 깊이
  outputLocale: OutputLocale;
}): Msg[] {
  const n = input.count ?? 8;
  const sys = [
    "You help a non-expert by selecting the core vocabulary (the 'mental containers') they need to know before building something in that field.",
    langInstruction(input.outputLocale),
    SECURITY_GUARD,
    input.difficulty ? `Difficulty target = ${input.difficulty}. Bias the WHOLE list to this depth, keeping the item count the same. 기초(basic): only the most foundational, beginner-safe terms; assume zero prior knowledge; avoid specialized jargon. 중급(intermediate): practical working terms for someone with some footing. 심화(advanced): specialized, professional, sharp-edge terms; assume the basics are already known. This depth shift overrides the default selection bias only on how advanced the terms are, not on the rules below.` : "",
    "Assume the reader is a non-expert hearing this for the first time; write short and easy (P15). one_line is one sentence; why is also exactly one sentence (a single period, never two or more sentences). No jargon, no verbosity.",
    "why = relevance transparency (IMPORTANT for trust): in that one sentence, tie THIS term directly to the user's stated goal and condition — say why someone doing exactly that task needs this term, concretely, so the reader feels it is for THEIR goal. Not a generic textbook reason; when topic or user_condition is given, reference it.",
    "Selection principle (P31, revised): (1) Terms the user wrote directly in their input (anchors) are considered already known — exclude them. (2) Avoid general/basic terms found in any intro textbook (e.g. big concepts everyone knows, like machine learning, overfitting, reinforcement learning); instead pick the concrete, professional, practical terms, techniques, and pitfalls actually encountered at that task/intersection. Go deep and sharp — what a practitioner in that field would say 'you must know this', the points where a non-expert stumbles in practice if they do not know them. (Depth benchmark example: if the domain is the intersection of time-series / econometrics / machine learning, aim at the level of stationarity, cointegration, endogeneity, instrumental variables, time-series cross-validation, feature leakage, structural VAR, nowcasting. This is only a benchmark for 'depth', not a fixed domain; produce terms that are equally concrete for the actual domain.) (3) Terms commonly used in their English original in practice may be kept as-is (nowcasting, feature leakage, etc.). Do not waste slots on surface synonyms, anchor restatements, or general intro terms.",
    `Produce exactly ${n} items. Do not waste slots on surface synonyms, anchor restatements, or general intro terms; choose terms concrete and professional enough to fill ${n}.`,
    "The grounding is English source material. Read the English sources and convert them into mental-container terms in the OUTPUT language (translate a foreign term into the output language's settled term; if none exists, write the output-language form with the original term in parentheses; but keep a term that is commonly used in its English original in that field as-is).",
    "Field-on rules (P30): turn on `direction` for gap_type c/d/e, or for job_type 의사결정/진단판단/협상설득준비. Turn on `use_example` for the writing task (글쓰기) or gap_type c. Turn on `context_note` for gap_type d/e. Turn on `relates_to` and `order` for gap_type b.",
    "group is the higher-level category name that bundles terms (a category label such as 'Generalization' or 'Training setup', written in the output language). Give the same group string to terms of the same nature (used by the group view).",
    "If a list of already-shown terms is given, exclude them and fill with the next-priority terms (no duplicates).",
    `SELF-CHECK before output: exactly ${n} items; none is a generic intro-textbook term; none restates an anchor term from the input; each why is exactly ONE sentence; if a difficulty target was given, the depth of every term matches it. Fix any violation before returning.`,
    'Output exactly one JSON object. Format: {"terms":[{"term","kind","group","priority","why","one_line","tag","direction"?,"use_example"?,"context_note"?,"relates_to"?,"order"?}]}. priority: 1 is top (ascending). why: why this priority in this situation. Always set tag to "몰라".',
    JSON_ONLY,
  ].filter(Boolean).join("\n");
  const user = [
    `area: ${input.area}`,
    input.difficulty ? `difficulty_target: ${input.difficulty}` : "",
    input.topic ? `User's original request (terms appearing here are anchors, so exclude them from the output): ${input.topic}` : "",
    `job_type (allowed values ${JOB_LIST}): ${input.job_type.join(", ")}`,
    input.gap_type?.length ? `gap_type (type of blockage): ${input.gap_type.join(", ")}` : "",
    input.user_condition ? `User condition: ${input.user_condition}` : "",
    input.context_object ? `Reference context (original text): ${input.context_object}` : "",
    `Reference grounding (English web search results):\n${input.grounding}`,
    input.exclude?.length ? `Already-shown terms (exclude): ${input.exclude.join(", ")}` : "",
    `Recommend exactly ${n} top-priority terms for this situation, in priority order, as JSON.`,
  ]
    .filter(Boolean)
    .join("\n");
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}
