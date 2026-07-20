// 프롬프트5. 단어 상세. 자세히 클릭 시에만 호출한다(on-demand, lazy).

import type { Msg, JobType, OutputLocale } from "@vock/shared";
import { langInstruction, SECURITY_GUARD, JSON_ONLY } from "./blocks.js";

export function buildPrompt5(input: {
  term: string;
  kind: string;
  area: string;
  job_type: JobType[];
  grounding?: string; // recommend서 재사용한 RAG 근거(있으면 출처 귀속에 쓴다)
  candidateSources?: { title: string; url: string }[]; // 근거 문서 목록. 이 중에서만 고른다.
  connection_hint?: string; // 연결 턴에서 확정된 정렬(프로젝트 제목과 아는 어휘). 이 어휘가 닿을 때만 약하게 반영.
  outputLocale: OutputLocale;
}): Msg[] {
  const sys = [
    "Explain the detail of one vocabulary card the user opened, as if speaking to a non-expert hearing it for the first time.",
    langInstruction(input.outputLocale),
    SECURITY_GUARD,
    "Write the body in 3 parts: what (the concept), whymine (why it matters to me), how (how to use it). If there is a helpful one-liner, put it in misc.",
    "what: lead with ONE plain-language definition sentence (the essence), then optionally ONE analogy sentence. The UI bolds the first sentence, so it must stand alone as the core meaning.",
    "whymine: 1-2 short sentences addressed to the user, on why this matters in their situation.",
    "how: 2-4 short, actionable steps. Write each step as its own separate sentence on its own line. Do NOT add any leading number, bullet, or marker (no '1.', '2.', '-', '•') — the UI numbers them automatically. No rambling. Unpack jargon.",
    input.connection_hint ? "A connection hint may be given (the user's project context and the vocabulary they already know that this work builds on). ONLY if THIS term genuinely connects to it, add ONE short, light bridge inside whymine showing how it relates to what they already know or their project — keep it subtle and secondary. If this term does not genuinely relate, ignore the hint and explain normally. Never force a connection or let it dominate; the explanation is primarily about the term itself." : "",
    "related are general related terms for detail browsing (a different concept from relates_to in prompt 3).",
    "sources: choose only those among the provided candidateSources that genuinely support this term (precision first). If unsure, leave an empty array. Do not invent sources not in the list (site may be left empty; the code fills it from the URL).",
    'Output exactly one JSON object. Format: {"what","whymine","how","misc"?,"related":[],"sources":[{"title","url"}]}.',
    JSON_ONLY,
  ].filter(Boolean).join("\n");
  const user = JSON.stringify({
    term: input.term,
    kind: input.kind,
    area: input.area,
    job_type: input.job_type,
    grounding: input.grounding ?? "",
    candidateSources: input.candidateSources ?? [],
    ...(input.connection_hint ? { connection_hint: input.connection_hint } : {}),
  });
  return [
    { role: "system", content: sys },
    { role: "user", content: user },
  ];
}
