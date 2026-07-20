// 연결 턴. 좁히기 종료 직전, 같은 프로젝트에서 이미 담은 어휘가 지금 좁힌 작업과 진짜로 연결되는지 판정해,
// 연결이 있으면 재인 질문 한 턴으로 드러낸다(없으면 relevant=false로 스킵). RAG 없이 1회 생성.

import type { Msg, JobType, OutputLocale } from "@vock/shared";
import { JOB_LIST, langInstruction, SECURITY_GUARD, EYE_LEVEL, JSON_ONLY } from "./blocks.js";

export function buildRelate(input: {
  area: string;
  job_type: JobType[];
  history: string[];
  topic?: string;
  kept: { term: string; one_line: string; area?: string }[];
  outputLocale: OutputLocale;
}): Msg[] {
  const sys = [
    "The user has, in earlier sessions of THIS project, curated (kept) the background vocabulary terms listed below. They are now narrowing a NEW task in the same field. Decide whether any kept term genuinely connects to the new narrowed task in a way that should shape what vocabulary they learn next, and if so, surface that connection as one short recognition question.",
    langInstruction(input.outputLocale),
    SECURITY_GUARD,
    "[RELEVANCE GATE — CRITICAL] Only claim a connection that is GENUINE and useful. If the kept terms do not meaningfully relate to the current narrowed task (different sub-topic, only a superficial keyword overlap, or a forced link), output relevant=false with an empty question, empty choices, and empty related_terms. Never fabricate a connection just to produce a question — a weak or spurious link is worse than none.",
    EYE_LEVEL,
    "When relevant=true: related_terms = the 1 to 3 kept terms the connection is based on (each MUST be from the provided kept list). question = a short, plain question telling the user 'you already know [those terms], and this current work seems to build on them — which direction are you taking?'. choices = 2 or 3 distinct, concrete next-step directions that build on those kept terms (each a single atomic branch describing what the user wants to do on top of what they already know).",
    "NEVER output an umbrella/combined option ('both', 'all', 'A and B together') or a meta-option ('not sure', 'unrelated', 'none') — the UI already provides a separate 'unrelated' escape. Each choice is one concrete direction, not a restatement of a kept term.",
    "SELF-CHECK before output: is the connection real and useful to someone doing the current task? If not, set relevant=false. If true, are all related_terms actually in the provided kept list, and is each choice a distinct concrete direction?",
    'Output exactly one JSON object. Format: {"relevant":bool,"question","choices":[{"label","domain_tag"}],"related_terms":[]}. When relevant is false, question must be "", choices must be [], and related_terms must be [].',
    JSON_ONLY,
  ].join("\n");
  const user = [
    `area: ${input.area}`,
    `job_type (allowed values ${JOB_LIST}): ${input.job_type.join(", ")}`,
    input.topic ? `User's current task (original request): ${input.topic}` : "",
    input.history.length ? `Current narrowing choices: ${input.history.join(", ")}` : "",
    `Kept background vocabulary from earlier sessions in this project:\n${input.kept.map((k) => `- ${k.term}: ${k.one_line}`).join("\n")}`,
    "Decide relevance and, if relevant, produce the connection question and 2-3 directions, as JSON.",
  ].filter(Boolean).join("\n");
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}
