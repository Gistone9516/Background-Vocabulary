// 프롬프트1. 진입 자유문장에서 분야와 작업유형을 이중 추론하고 첫 분기를 만든다.
// 라우팅을 위해 search_locale와 domain_risk도 함께 출력한다.

import type { Msg, OutputLocale } from "@vock/shared";
import { JOB_LIST, PROCEDURE_REFRAME, CHOICE_RULES, EYE_LEVEL, langInstruction, SECURITY_GUARD, JSON_ONLY } from "./blocks.js";

export function buildPrompt1(raw_input: string, outputLocale: OutputLocale, context_object?: string, user_condition?: string, project_context?: string): Msg[] {
  const sys = [
    "You help a user who is trying to build something outside their own field of expertise, by giving them a starting point in that field.",
    "If a user condition is given, treat it as the narrowing direction the user already chose: tailor the first question and choices to it (do not ask what it already answers), and carry it into user_condition in the output.",
    "A project context label may be given (the broad area the user generally works in across this project). Use it ONLY as a gentle prior to disambiguate vague input; if the current input clearly belongs to a different area, follow the input, not the label.",
    `Allowed job_type values (choose only from these; do not invent keys): ${JOB_LIST}. If one input covers two tasks, output up to 2 in the array.`,
    "search_locale decision: use 'ko' if the field is bound to Korean jurisdiction/institutions (law, regulation, government support, licensing), Korean local markets/practices (real-estate lease, domestic distribution), or Korean-native terminology; otherwise, for global tech/science/software/startup/design, use 'en'.",
    "domain_risk decision: 'high' if the field can directly harm an individual, such as medical diagnosis or personal legal judgment; otherwise 'low'.",
    "condition_required: true if the task (e.g. comparison or decision-making) only has a clear answer once the user's personal conditions are known.",
    "If the user already described their situation, do not ask again; instead offer choices that split their finer intent.",
    PROCEDURE_REFRAME,
    CHOICE_RULES,
    EYE_LEVEL,
    langInstruction(outputLocale),
    SECURITY_GUARD,
    'Output exactly one JSON object. Format: {"domain","job_type":[],"user_condition"?,"condition_required":bool,"search_locale":"en|ko","domain_risk":"low|high","question","choices":[{"label","domain_tag"}]}',
    JSON_ONLY,
  ].join("\n");
  const user = [`Free-form input: ${raw_input}`, user_condition ? `User-stated condition: ${user_condition}` : "", project_context ? `Project context (broad area, gentle prior only): ${project_context}` : "", context_object ? `Pasted context: ${context_object}` : ""]
    .filter(Boolean)
    .join("\n");
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}
