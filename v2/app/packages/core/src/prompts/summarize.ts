// 프롬프트4. 태깅 결과를 받아 메인 AI에 넘길 정리 텍스트를 만든다.

import type { Msg, JobType, Tag, OutputLocale } from "@vock/shared";
import { langInstruction, SECURITY_GUARD, JSON_ONLY } from "./blocks.js";

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
    "Given the tagged vocabulary and the situation, write a detailed, paste-ready briefing the user will drop into their main AI (ChatGPT, Claude, etc.) so it explains these terms in the context of the project they are working on.",
    langInstruction(input.outputLocale),
    SECURITY_GUARD,
    "Build paste_text as a rich, well-structured briefing (not a single sentence). Use plain line breaks between parts. It must contain three parts:",
    "Part 1 (opening): state what the user is trying to do (task_intent) in the field (area), and weave in their situation/direction (user_condition) and any reference context (context_object) when present. One short paragraph.",
    "Part 2 (the vocabulary): list each key term on its own line as \"term: one short, plain-language meaning grounded in this project's context\". This tells the main AI the user's vocabulary level and exactly which concepts matter.",
    "Part 3 (the ask): ask the main AI to explain how these concepts apply to the user's specific project, prioritized, with concrete examples, and to surface 2-3 follow-up questions worth asking next.",
    "Treat user_condition as the steering direction for focus and tone (e.g. 'keep it simple', 'interview prep', 'practical application'), not merely a 'my situation' slot. If user_condition is empty, write a sensible neutral briefing.",
    "Be genuinely detailed and clear, but no filler or repetition. Keep each term's meaning to one line.",
    "If job_type has multiple values, write both tasks in task_intent.",
    "Generate context_sentence from background_hint.",
    'Output exactly one JSON object. Format: {"area","task_intent","user_condition"?,"context_object"?,"context_sentence","vocab":[{"term","tag"}],"paste_text"}. paste_text holds the full multi-part briefing.',
    JSON_ONLY,
  ].join("\n");
  const user = JSON.stringify(input);
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}
