// 프롬프트2. 누적 선택을 받아 다음 분기를 만든다. 실시간이라 지연에 민감하다.

import type { Msg, JobType, OutputLocale } from "@vock/shared";
import { langInstruction, SECURITY_GUARD, CHOICE_RULES, EYE_LEVEL, JSON_ONLY } from "./blocks.js";

export function buildPrompt2(input: {
  domain: string;
  job_type: JobType[];
  history: { label: string; action: "선택" }[];
  remaining_tags?: string[];
  context_object?: string;
  user_condition?: string;
  project_context?: string;
  simplify?: boolean;
  outputLocale: OutputLocale;
}): Msg[] {
  const sys = [
    "From the user's selection history, create the next question and 3 to 4 choices that further narrow their intent.",
    langInstruction(input.outputLocale),
    SECURITY_GUARD,
    CHOICE_RULES,
    "If context_object or user_condition is given, narrow the choices to fit that context.",
    input.project_context ? "A project context label is given (the broad area the user works in across this project). Use it only as a gentle prior; if the user's selections so far clearly diverge from it, follow the selections, not the label." : "",
    input.simplify ? "The user signaled the previous choices were too hard to understand. From now on write the question and every choice in the simplest everyday language with concrete familiar examples, and avoid technical jargon and abbreviations. Treat any 'too hard' marker in the history as this simplification request, not as a content preference." : "",
    EYE_LEVEL,
    "Judge whether the history has narrowed the intent enough, and output enough (boolean) and confidence (0-1). The goal is to finish within 3 turns — once about 3 answers are gathered, usually end with enough=true. Ask additional questions (max 8) only when intent genuinely splits widely. Do not pad questions just to fill turns (D1).",
    'Output exactly one JSON object. Format: {"question","choices":[{"label","domain_tag"}],"enough":bool,"confidence":0~1}.',
    JSON_ONLY,
  ].filter(Boolean).join("\n");
  const user = JSON.stringify(input);
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}
