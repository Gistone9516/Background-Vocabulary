// 프롬프트4. 담은 어휘를 받아 구조화된 프라이머(PrimerDoc)를 만든다.
// 붙여넣을 한 덩어리는 여기서 만들지 않는다. 클라가 이 구조에서 조립한다(FR-604).

import type { Msg, JobType, OutputLocale } from "@vock/shared";
import { langInstruction, SECURITY_GUARD, JSON_ONLY } from "./blocks.js";

export function buildPrompt4(input: {
  area: string;
  job_type: JobType[];
  vocab: string[];
  user_condition?: string;
  context_object?: string;
  background_hint?: string;
  outputLocale: OutputLocale;
}): Msg[] {
  const sys = [
    "Given the collected vocabulary and the situation, produce a STRUCTURED primer the user will hand to their main AI (ChatGPT, Claude, etc.) as context for the project they are working on.",
    langInstruction(input.outputLocale),
    SECURITY_GUARD,
    "You output structured fields only. Do NOT compose a paste-ready paragraph or any prose blob — the client assembles the final text from your fields.",
    "task_intent: what the user is trying to do, one clear sentence. If job_type has multiple values, cover both.",
    "terms: the vocabulary the user collected, as plain term strings in the order given. No objects, no explanations, no additions or removals.",
    "context_note: one short sentence derived from background_hint that tells the main AI what reference material or situation is in play. Omit the field entirely when there is no background_hint.",
    "user_condition: the steering direction for focus and tone (e.g. 'keep it simple', 'interview prep', 'practical application'), restated compactly. Omit the field entirely when the user gave none.",
    "Omit any field whose value would be empty. Never emit an empty string or a placeholder.",
    "Never instruct the main AI to define or re-explain these terms. The user already has them; the primer exists to state what the user knows so the AI can skip that ground.",
    'Output exactly one JSON object. Format: {"area","task_intent","user_condition"?,"context_note"?,"terms":[]}.',
    JSON_ONLY,
  ].join("\n");
  const user = JSON.stringify(input);
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}
