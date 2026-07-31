// 펼친 상세의 캐시 키. Prompt5In 전 필드 + 프롬프트 버전에서 조립한다(E-3·E-7).
//
// 어휘 단위(term_norm)로 캐시하지 않는 이유: Prompt5Out.whymine은 "왜 나에게 중요"라
// 세션 맥락(topic·job_type·connection_hint)에 의존한다. 어휘로 키를 만들면 다른 세션에서
// 이전 세션의 내 맥락이 나오고, 그것이 틀렸다는 걸 사용자가 알아챌 방법이 없다.

import type { Prompt5In } from "./types/pipeline-io.js";

// 상세 프롬프트를 개편하면 올린다. 올리지 않으면 옛 본문이 영구히 반환되고,
// 개편이 반영되지 않았는데 화면은 정상으로 보인다.
export const DETAIL_PROMPT_VERSION = 1;

// 길이 접두어로 잇는다. 구분자 문자를 쓰지 않는 이유는 topic이 자유 입력이라
// 어떤 구분자든 본문에 나타날 수 있고, 그러면 서로 다른 입력이 같은 키로 접히기 때문이다.
function part(s: string): string {
  return `${s.length}:${s}`;
}

// 정규 문자열. 필드 순서를 손으로 고정한다 — JSON.stringify의 키 순서에 기대면
// 타입 선언이 바뀌는 순간 조용히 다른 키가 나오고 전건 캐시 미스가 된다.
export function canonicalDetailInput(input: Prompt5In): string {
  return [
    part(`v${DETAIL_PROMPT_VERSION}`),
    part(input.term),
    part(input.kind),
    part(input.area),
    // 고른 순서가 달라도 같은 요청이다. 정렬하지 않으면 같은 화면에서 캐시가 빗나간다.
    part([...input.job_type].sort().join(",")),
    part(input.domain),
    part(input.topic),
    part(input.locale),
    part(input.connection_hint ?? ""),
  ].join("");
}

// 저장·조회에 쓰는 키. SHA-256 hex 64자라 인덱스 크기가 입력 길이와 무관해진다.
// Web Crypto는 세 런타임에 모두 있다(core/auth/jwt.ts 선례).
export async function detailInputKey(input: Prompt5In): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalDetailInput(input));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
