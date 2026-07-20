// 프리뷰. 난이도 선택 직전, 좁혀진 주제의 깊이별 대표 어휘 1개씩(기초/중급/심화)을 미리 보여 준다.
// RAG 없이 1회 생성. 사용자가 난이도를 감으로 고르게 돕는 경량 예시(term + 한 줄 설명).

import type { Msg, JobType, OutputLocale } from "@vock/shared";
import { JOB_LIST, langInstruction, SECURITY_GUARD, JSON_ONLY } from "./blocks.js";

export function buildPreview(input: {
  area: string;
  job_type: JobType[];
  history: string[];
  topic?: string;
  outputLocale: OutputLocale;
}): Msg[] {
  const sys = [
    "You help a non-expert decide how deep they want the vocabulary for a field. For the narrowed topic, give ONE representative example term for each of three depths so they can feel the difference and pick a level.",
    langInstruction(input.outputLocale),
    SECURITY_GUARD,
    "Pick three terms at clearly different depths. CRITICAL: BOTH 중급(intermediate) and 심화(advanced) must be genuinely DEEP, specialized terms — the kind that makes a domain expert think 'oh, you even know that?'. Only 기초(basic) is beginner-level. 기초: the very first everyday word a total newcomer meets on page one of any intro (instantly recognizable). 중급: a real practitioner's term that casual learners and intro guides never mention — already expert-flavored, NOT introductory. 심화: even sharper and more obscure than 중급 — a niche technique, a subtle pitfall, or an insider concept that even many working practitioners might not know; the deepest of the three. The jump from 기초 to 중급 is large, and 심화 goes deeper still. All three belong to the narrowed topic; none is a fancier synonym of another.",
    "Assume the reader is a non-expert hearing this for the first time (P15). Each `line` is ONE short, plain-language sentence (a single period) explaining the term with no jargon. Keep a term commonly used in its English original in that field as-is.",
    "Do not pick a term the user already wrote in their input (anchors); pick fresh representative terms.",
    "SELF-CHECK before output: 기초 must be obviously beginner-level; BOTH 중급 and 심화 must be deep enough that a non-expert has never heard them and a domain expert would be impressed a non-expert knows them; 심화 must be clearly deeper/more obscure than 중급. If 중급 looks like something a beginner or an intro guide would mention, replace it with a sharper practitioner term and re-pick before returning.",
    'Output exactly one JSON object. Format: {"basic":{"term","line"},"inter":{"term","line"},"adv":{"term","line"}}.',
    JSON_ONLY,
  ].join("\n");
  const user = [
    `area: ${input.area}`,
    `job_type (allowed values ${JOB_LIST}): ${input.job_type.join(", ")}`,
    input.topic ? `User's original request (terms here are anchors — avoid them): ${input.topic}` : "",
    input.history.length ? `Narrowing choices so far: ${input.history.join(", ")}` : "",
    "Give one representative term per depth (기초/중급/심화) for this narrowed topic, as JSON.",
  ].filter(Boolean).join("\n");
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}
