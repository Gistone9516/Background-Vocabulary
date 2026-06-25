// 프롬프트 빌더 SoT. 정본은 기획 5장과 5-1 계약이다.
// 각 빌더는 Msg[]를 반환한다. 모든 호출은 json_object와 thinking 비활성으로 보낸다(G1 검증).
// 프롬프트 본문은 영어로 작성한다(다국어 출력 준수 확보; 한국어 베이스는 ja/zh 출력을 한국어로 끌어당겼다).
// 사용자에게 보일 출력 언어는 langInstruction(outputLocale)이 강제한다. enum 허용값(job_type·tag·gap_type·action)은 한국어 리터럴 그대로 둔다(계약 키).

import type { Msg } from "../interfaces.js";
import { JOB_TYPES, type JobType, type GapType, type Tag, type OutputLocale } from "../types.js";

const JOB_LIST = JOB_TYPES.join("·");

// 모든 출력에 공통으로 거는 눈높이 규칙(기획 P15).
const EYE_LEVEL =
  "Every output (choices, recommendations, why, detail) assumes the reader is a non-expert hearing this for the first time. Keep it short and clear; no rambling. Avoid jargon, technical terms, and nested modifiers; explain in plain words. Each item is 1-2 sentences.";

// 출력 언어 이름표.
const LANG_NAME: Record<OutputLocale, string> = {
  ko: "Korean (한국어)",
  en: "English",
  ja: "Japanese (日本語)",
  zh: "Simplified Chinese (简体中文)",
};
// 출력 언어 지시(최우선). 사용자에게 보일 모든 텍스트 값을 이 언어로만 쓰게 한다(JSON 키·enum 허용값은 원형 유지).
function langInstruction(loc: OutputLocale): string {
  return `[OUTPUT LANGUAGE — HIGHEST PRIORITY] Write every user-facing text value (question, label, term, one_line, why, what, whymine, how, misc, paste_text, etc.) strictly and only in ${LANG_NAME[loc]}. Do NOT mix in any other language. Keep JSON keys and enum allowed-values (job_type, search_locale, domain_risk, tag, gap_type, action) in their original specified form.`;
}

// 프롬프트1. 진입 자유문장에서 분야와 작업유형을 이중 추론하고 첫 분기를 만든다.
// 구현계획 6장 라우팅을 위해 search_locale와 domain_risk도 함께 출력한다.
export function buildPrompt1(raw_input: string, outputLocale: OutputLocale, context_object?: string): Msg[] {
  const sys = [
    "You help a user who is trying to build something outside their own field of expertise, by giving them a starting point in that field.",
    `Allowed job_type values (choose only from these; do not invent keys): ${JOB_LIST}. If one input covers two tasks, output up to 2 in the array.`,
    "search_locale decision: use 'ko' if the field is bound to Korean jurisdiction/institutions (law, regulation, government support, licensing), Korean local markets/practices (real-estate lease, domestic distribution), or Korean-native terminology; otherwise, for global tech/science/software/startup/design, use 'en'.",
    "domain_risk decision: 'high' if the field can directly harm an individual, such as medical diagnosis or personal legal judgment; otherwise 'low'.",
    "condition_required: true if the task (e.g. comparison or decision-making) only has a clear answer once the user's personal conditions are known.",
    "If the user already described their situation, do not ask again; instead offer choices that split their finer intent.",
    "The user can pick several choices at once (multi-select). Therefore never create a merged/umbrella option that combines other choices, like 'both A and B' or 'all of the above'. Each choice must be a single, non-overlapping branch.",
    EYE_LEVEL,
    langInstruction(outputLocale),
    'Output exactly one JSON object. Format: {"domain","job_type":[],"user_condition"?,"condition_required":bool,"search_locale":"en|ko","domain_risk":"low|high","question","choices":[{"label","domain_tag"}]}',
    "Output only valid JSON.",
  ].join("\n");
  const user = [`Free-form input: ${raw_input}`, context_object ? `Pasted context: ${context_object}` : ""]
    .filter(Boolean)
    .join("\n");
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}

// 프롬프트2. 누적 선택을 받아 다음 분기를 만든다. 실시간이라 지연에 민감하다.
export function buildPrompt2(input: {
  domain: string;
  job_type: JobType[];
  history: { label: string; action: "선택" | "더깊이" }[];
  remaining_tags?: string[];
  context_object?: string;
  user_condition?: string;
  outputLocale: OutputLocale;
}): Msg[] {
  const sys = [
    "From the user's selection history, create the next question and 3 to 4 choices that further narrow their intent.",
    langInstruction(input.outputLocale),
    "The user can pick several choices at once (multi-select). Therefore never create a merged/umbrella option that combines other choices, like 'both A and B' or 'all of the above'. Each choice must be a single, non-overlapping branch.",
    "If action is '더깊이' (go deeper), create sub-branches or derived choices of the immediately preceding branch (do not update the intent distribution).",
    "If context_object or user_condition is given, narrow the choices to fit that context.",
    EYE_LEVEL,
    "Judge whether the history has narrowed the intent enough, and output enough (boolean) and confidence (0-1). The goal is to finish within 3 turns — once about 3 answers are gathered, usually end with enough=true. Ask additional questions (max 8) only when intent genuinely splits widely. Do not pad questions just to fill turns (D1).",
    'Output exactly one JSON object. Format: {"question","choices":[{"label","domain_tag"}],"enough":bool,"confidence":0~1}. Must be valid JSON.',
  ].join("\n");
  const user = JSON.stringify(input);
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}

// 프롬프트3. 좁혀진 영역과 상황을 받아 우선순위 추천 어휘를 만든다. 추천 엔진(기획 P13).
// 영어 RAG 근거를 출력 언어의 말그릇으로 변환한다.
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
  outputLocale: OutputLocale;
}): Msg[] {
  const n = input.count ?? 8;
  const sys = [
    "You help a non-expert by selecting the core vocabulary (the 'mental containers') they need to know before building something in that field.",
    langInstruction(input.outputLocale),
    "Assume the reader is a non-expert hearing this for the first time; write short and easy (P15). one_line is one sentence; why is also exactly one sentence (a single period, never two or more sentences). No jargon, no verbosity.",
    "Selection principle (P31, revised): (1) Terms the user wrote directly in their input (anchors) are considered already known — exclude them. (2) Avoid general/basic terms found in any intro textbook (e.g. big concepts everyone knows, like machine learning, overfitting, reinforcement learning); instead pick the concrete, professional, practical terms, techniques, and pitfalls actually encountered at that task/intersection. Go deep and sharp — what a practitioner in that field would say 'you must know this', the points where a non-expert stumbles in practice if they do not know them. (Depth benchmark example: if the domain is the intersection of time-series / econometrics / machine learning, aim at the level of stationarity, cointegration, endogeneity, instrumental variables, time-series cross-validation, feature leakage, structural VAR, nowcasting. This is only a benchmark for 'depth', not a fixed domain; produce terms that are equally concrete for the actual domain.) (3) Terms commonly used in their English original in practice may be kept as-is (nowcasting, feature leakage, etc.). Do not waste slots on surface synonyms, anchor restatements, or general intro terms.",
    `Produce exactly ${n} items. Do not waste slots on surface synonyms, anchor restatements, or general intro terms; choose terms concrete and professional enough to fill ${n}.`,
    "The grounding is English source material. Read the English sources and convert them into mental-container terms in the OUTPUT language (translate a foreign term into the output language's settled term; if none exists, write the output-language form with the original term in parentheses; but keep a term that is commonly used in its English original in that field as-is).",
    "Field-on rules (P30): turn on `direction` for gap_type c/d/e, or for job_type 의사결정/진단판단/협상설득준비. Turn on `use_example` for the writing task (글쓰기) or gap_type c. Turn on `context_note` for gap_type d/e. Turn on `relates_to` and `order` for gap_type b.",
    "group is the higher-level category name that bundles terms (a category label such as 'Generalization' or 'Training setup', written in the output language). Give the same group string to terms of the same nature (used by the group view).",
    "If a list of already-shown terms is given, exclude them and fill with the next-priority terms (no duplicates).",
    'Output exactly one JSON object. Format: {"terms":[{"term","kind","group","priority","why","one_line","tag","direction"?,"use_example"?,"context_note"?,"relates_to"?,"order"?}]}. priority: 1 is top (ascending). why: why this priority in this situation. Always set tag to "몰라".',
    "Output only valid JSON.",
  ].join("\n");
  const user = [
    `area: ${input.area}`,
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

// 프롬프트4. 태깅 결과를 받아 메인 AI에 넘길 정리 텍스트를 만든다.
export function buildPrompt4(input: {
  area: string;
  job_type: JobType[];
  vocab: { term: string; tag: Tag }[];
  user_condition?: string;
  context_object?: string;
  background_hint?: string;
  outputLocale: OutputLocale;
}): Msg[] {
  const sys = [
    "Given the tagged vocabulary and the situation, create a summary text the user can paste directly into their main AI.",
    langInstruction(input.outputLocale),
    'paste_text structure template (render this meaning naturally in the output language): "I am trying to [task_intent] in the field of [area]. (My situation: [user_condition]) Among the key terms A, B, C, I do not know B well. (Reference context: [context_object])". Omit empty slots.',
    "If job_type has multiple values, write both tasks in task_intent.",
    "Generate context_sentence from background_hint.",
    'Output exactly one JSON object. Format: {"area","task_intent","user_condition"?,"context_object"?,"context_sentence","vocab":[{"term","tag"}],"paste_text"}. Must be valid JSON.',
  ].join("\n");
  const user = JSON.stringify(input);
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}

// 프롬프트5. 단어 상세. 자세히 클릭 시에만 호출한다(on-demand, lazy).
export function buildPrompt5(input: {
  term: string;
  kind: string;
  area: string;
  job_type: JobType[];
  deepen?: boolean;
  grounding?: string; // recommend서 재사용한 RAG 근거(있으면 출처 귀속에 쓴다)
  candidateSources?: { title: string; url: string }[]; // 근거 문서 목록. 이 중에서만 고른다.
  outputLocale: OutputLocale;
}): Msg[] {
  const sys = [
    "Explain the detail of one vocabulary card the user opened, as if speaking to a non-expert hearing it for the first time.",
    langInstruction(input.outputLocale),
    "Write the body in 3 parts: what (the concept — what it is) · whymine (my context — why it matters to me) · how (usage — how to use it). If there is a helpful one-liner, put it in misc.",
    "Each part is 1-2 short, easy sentences. No rambling or verbosity. Unpack jargon; keep any analogy to one line.",
    "related are general related terms for detail browsing (a different concept from relates_to in prompt 3).",
    "sources: choose only those among the provided candidateSources that genuinely support this term (precision first). If unsure, leave an empty array. Do not invent sources not in the list (site may be left empty; the code fills it from the URL).",
    input.deepen ? "deepen is on, so add one concrete example or analogy to how." : "",
    'Output exactly one JSON object. Format: {"what","whymine","how","misc"?,"related":[],"sources":[{"title","url"}],"example"?}. Must be valid JSON.',
  ].filter(Boolean).join("\n");
  const user = JSON.stringify({
    term: input.term,
    kind: input.kind,
    area: input.area,
    job_type: input.job_type,
    deepen: input.deepen ?? false,
    grounding: input.grounding ?? "",
    candidateSources: input.candidateSources ?? [],
  });
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}
