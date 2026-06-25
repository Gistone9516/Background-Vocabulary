// 프롬프트 빌더 SoT. 정본은 기획 5장과 5-1 계약이다.
// 각 빌더는 Msg[]를 반환한다. 모든 호출은 json_object와 thinking 비활성으로 보낸다(G1 검증).
// 프롬프트3은 G1 스모크에서 영어 RAG를 한국어 말그릇으로 변환하는 품질이 확인된 버전이다.

import type { Msg } from "../interfaces.js";
import { JOB_TYPES, type JobType, type GapType, type Tag, type OutputLocale } from "../types.js";

const JOB_LIST = JOB_TYPES.join("·");

// 모든 출력에 공통으로 거는 눈높이 규칙(기획 P15).
const EYE_LEVEL =
  "모든 출력(선택지, 추천, why, 상세)은 비전공자가 처음 듣는다고 가정하고 쓴다. 짧고 명확하게, 주저리 금지. 한자어·전문용어·중첩 수식을 피하고 쉬운 말로 푼다. 한 항목은 1~2문장.";

// 출력 언어 이름표.
const LANG_NAME: Record<OutputLocale, string> = {
  ko: "한국어",
  en: "English",
  ja: "일본어(Japanese)",
  zh: "중국어 간체(Simplified Chinese)",
};
// 출력 언어 지시(최우선). 사용자에게 보일 모든 텍스트 값을 이 언어로만 쓰게 한다(JSON 키·enum 허용값은 영문 유지).
// 다른 언어(특히 한국어) 혼입을 막는다. 지시문 자체 언어와 출력 언어는 별개임을 명시한다.
function langInstruction(loc: OutputLocale): string {
  return `[OUTPUT LANGUAGE — HIGHEST PRIORITY] Write every user-facing text value (question, label, term, one_line, why, what, whymine, how, misc, paste_text, etc.) strictly and only in ${LANG_NAME[loc]}. Do NOT mix in any other language (especially Korean) unless the target language IS that language. These instructions are written in Korean only for the developer; that must NOT make you output Korean. Keep JSON keys and enum allowed-values (job_type, search_locale, domain_risk, tag) in their original ASCII/specified form.`;
}

// 프롬프트1. 진입 자유문장에서 분야와 작업유형을 이중 추론하고 첫 분기를 만든다.
// 구현계획 6장 라우팅을 위해 search_locale와 domain_risk도 함께 출력한다.
export function buildPrompt1(raw_input: string, outputLocale: OutputLocale, context_object?: string): Msg[] {
  const sys = [
    "너는 사용자가 자기 전공 밖 분야로 무언가 만들려 할 때, 그 분야의 출발점을 잡아주는 도우미다.",
    `job_type 허용값(이 중에서만, 키 변동 금지): ${JOB_LIST}. 한 입력이 두 작업을 겸하면 최대 2개까지 배열로 출력한다.`,
    "search_locale 판정: 한국 관할/제도(법령 규제 정부지원 인허가), 한국 로컬 시장/관행(부동산 임대차 국내유통), 한국어 토착 용어 분야면 'ko', 그 외 글로벌 기술/과학/SW/스타트업/디자인은 'en'.",
    "domain_risk 판정: 의료 진단이나 법률 개인 판단처럼 개인에게 직접 위해가 될 수 있는 고위험 분야면 'high', 그 외 'low'.",
    "condition_required: 비교나 의사결정처럼 사용자 개인 조건이 있어야 답이 갈리는 작업이면 true.",
    "사용자가 이미 상황을 서술했으면 다시 묻지 말고 세부 의중을 가르는 선택지를 낸다.",
    "선택지는 사용자가 여러 개를 동시에 고를 수 있다(복수 선택). 그러므로 'A와 B 둘 다' 또는 '모두 해당'처럼 다른 선택지를 합쳐 만든 통합 보기를 절대 만들지 마라. 각 선택지는 서로 겹치지 않는 단일 갈래여야 한다.",
    EYE_LEVEL,
    langInstruction(outputLocale),
    'JSON 객체 하나만 출력한다. 형식: {"domain","job_type":[],"user_condition"?,"condition_required":bool,"search_locale":"en|ko","domain_risk":"low|high","question","choices":[{"label","domain_tag"}]}',
    "반드시 유효한 json만 출력한다.",
  ].join("\n");
  const user = [`자유문장: ${raw_input}`, context_object ? `붙여넣은 맥락: ${context_object}` : ""]
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
    "사용자의 선택 이력을 보고 의중을 더 좁히는 다음 질문과 선택지 3개에서 4개를 만든다.",
    langInstruction(input.outputLocale),
    "선택지는 사용자가 여러 개를 동시에 고를 수 있다(복수 선택). 그러므로 'A와 B 둘 다' 또는 '모두 해당'처럼 다른 선택지를 합쳐 만든 통합 보기를 절대 만들지 마라. 각 선택지는 서로 겹치지 않는 단일 갈래여야 한다.",
    "action이 '더깊이'면 직전 갈래의 하위 또는 파생 선택지를 만든다(의중 분포는 갱신하지 않는다).",
    "context_object나 user_condition이 있으면 그 맥락에 맞춰 선택지를 좁힌다.",
    EYE_LEVEL,
    "이력이 의중을 충분히 좁혔는지 판단해 enough(불리언)와 confidence(0~1)를 낸다. 목표는 3턴 안에 마무리다 — 3턴쯤 답을 모으면 대개 enough=true로 끝낸다. 의중이 정말 크게 갈릴 때만 추가 질문(최대 8). 질문을 채우려고 늘리지 않는다(D1).",
    'JSON 하나만 출력한다. 형식: {"question","choices":[{"label","domain_tag"}],"enough":bool,"confidence":0~1}. 반드시 유효한 json.',
  ].join("\n");
  const user = JSON.stringify(input);
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}

// 프롬프트3. 좁혀진 영역과 상황을 받아 우선순위 추천 어휘를 만든다. 추천 엔진(기획 P13).
// G1 스모크에서 검증된 버전. 영어 RAG 근거를 한국어 말그릇으로 변환한다.
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
    "너는 비전공자가 그 분야로 무언가 만들기 전에 알아야 할 핵심 어휘(말그릇)를 골라주는 도우미다.",
    langInstruction(input.outputLocale),
    "비전공자가 처음 듣는다 가정하고 짧고 쉽게 쓴다(P15). one_line은 한 문장, why도 정확히 한 문장(마침표 하나, 두 문장 이상 금지). 한자어·장황 금지.",
    "선정 원칙(P31 개정): ① 사용자가 입력에 직접 쓴 용어(앵커)는 이미 아는 것으로 보고 제외한다. ② 개론서에 나오는 일반·기초 용어(예: 머신러닝·과적합·강화학습처럼 누구나 아는 큰 개념)는 피하고, 그 작업·교차점에서 실제로 부딪히는 '구체적이고 전문적인 실무 용어·기법·함정'을 고른다. 깊고 날카롭게 — 그 분야 실무자가 '이건 알아야지' 하는 것, 비전공자가 모르면 실전에서 헛디디는 지점. (구체성 기준 예시: 도메인이 시계열·계량경제·머신러닝 교차면 정상성·공적분·내생성·도구변수·시계열 교차검증·feature leakage·구조적 VAR·nowcasting 수준. 이 예시는 '깊이'의 기준일 뿐 도메인 고정이 아니며, 실제 도메인에 맞춰 그만큼 구체적인 용어를 낸다.) ③ 실무에서 영어로 통용되는 용어는 그대로 써도 된다(nowcasting, feature leakage 등). 표층 동의어·앵커 재진술·일반 개론어로 슬롯 낭비 금지.",
    `정확히 ${n}개를 낸다. 표층 동의어·앵커 재진술·일반 개론어로 슬롯을 낭비하지 말고 ${n}개를 채울 만큼 구체적·전문적 용어를 고른다.`,
    "근거는 영어 자료다. 영어 자료를 읽고 출력 언어의 말그릇으로 변환한다(외국어 용어는 출력 언어의 정착어로, 없으면 출력 언어 표기와 괄호 안 원어를 병기. 단 그 분야에서 영어 원어로 통용되는 용어는 원어 그대로 둔다).",
    "필드 켜기 규칙(기획 P30): direction은 gap_type c d e 또는 job_type 의사결정 진단판단 협상설득준비에서 켠다. use_example은 글쓰기 작업 또는 gap_type c에서 켠다. context_note는 gap_type d e에서 켠다. relates_to와 order는 gap_type b에서 켠다.",
    "group은 어휘를 묶는 상위 분류명(예: 일반화, 학습 설정)이다. 같은 성격끼리 같은 group 문자열을 부여한다(그룹뷰용).",
    "이미 제시한 어휘 목록이 주어지면 그것을 빼고 다음 우선순위 어휘로 채운다(중복 금지).",
    'JSON 객체 하나만 출력한다. 형식: {"terms":[{"term","kind","group","priority","why","one_line","tag","direction"?,"use_example"?,"context_note"?,"relates_to"?,"order"?}]}. priority는 1이 최우선(오름차순). why는 이 상황에서 왜 이 우선순위인지 근거. tag는 항상 "몰라"로 둔다.',
    "반드시 유효한 json만 출력한다.",
  ].join("\n");
  const user = [
    `area(분야): ${input.area}`,
    input.topic ? `사용자 원래 요청(이 안에 등장하는 용어는 앵커이므로 출력에서 제외): ${input.topic}` : "",
    `job_type(허용값 ${JOB_LIST}): ${input.job_type.join(", ")}`,
    input.gap_type?.length ? `gap_type(막힘 유형): ${input.gap_type.join(", ")}` : "",
    input.user_condition ? `사용자 조건: ${input.user_condition}` : "",
    input.context_object ? `참고 맥락(원문): ${input.context_object}` : "",
    `참고 근거(영어 웹 검색 결과):\n${input.grounding}`,
    input.exclude?.length ? `이미 제시한 어휘(제외): ${input.exclude.join(", ")}` : "",
    `이 상황 최우선 어휘 정확히 ${n}개를 우선순위 순으로 json으로 추천하라.`,
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
    "태깅된 어휘와 상황을 받아 사용자가 메인 AI에 그대로 붙여넣을 정리 텍스트를 만든다.",
    langInstruction(input.outputLocale),
    'paste_text 구조 템플릿(이 의미를 출력 언어로 자연스럽게 옮긴다): "나는 [분야] 영역에서 [task_intent]를 하려 한다. (내 상황: [user_condition]) 핵심어 A·B·C 중 B는 잘 모른다. (참고 맥락: [context_object])". 빈 슬롯은 생략한다.',
    "job_type이 복수면 task_intent에 두 작업을 함께 적는다.",
    "context_sentence는 background_hint에서 생성한다.",
    'JSON 하나만 출력한다. 형식: {"area","task_intent","user_condition"?,"context_object"?,"context_sentence","vocab":[{"term","tag"}],"paste_text"}. 반드시 유효한 json.',
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
    "사용자가 연 어휘 카드 하나의 상세를 처음 듣는 비전공자에게 말하듯 설명한다.",
    langInstruction(input.outputLocale),
    "본문은 3단으로 쓴다: what(개념, 이게 뭐냐) · whymine(내 맥락, 왜 나에게 중요) · how(활용, 어떻게 쓰냐). 보조 한 줄이 있으면 misc.",
    "각 단은 1~2문장으로 짧고 쉽게. 주저리·장황 금지. 한자어·전문용어는 풀어쓰고 비유는 한 줄.",
    "related는 상세 열람용 일반 관련어다(프롬프트3의 relates_to와 다른 개념).",
    "sources는 제공된 candidateSources 중 이 어휘를 실제로 뒷받침하는 것만 고른다(정밀 우선). 확신이 없으면 빈 배열로 둔다. 목록에 없는 출처를 지어내지 않는다(site는 비워도 된다. 코드가 URL에서 채운다).",
    input.deepen ? "deepen이 켜졌으니 how에 구체 예시나 비유를 한 가지 더한다." : "",
    'JSON 하나만 출력한다. 형식: {"what","whymine","how","misc"?,"related":[],"sources":[{"title","url"}],"example"?}. 반드시 유효한 json.',
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
