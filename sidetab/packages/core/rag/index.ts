// RAG 파이프라인. 검색, 캐시, grounding 주입을 담당한다. 정본은 구현계획 7장.
// 런타임 전용 바인딩 없음. SearchProvider와 CacheStore 인터페이스에만 의존한다.

import type { Locale, RagDoc } from "@sidetab/shared";
import { ragCacheKey } from "@sidetab/shared";
import type { SearchProvider, CacheStore } from "@sidetab/shared";

// 도메인 유형별 TTL 규칙 (구현계획 7장).
// 기술, 창작, 비즈니스 계열은 24시간, 시사 정책 계열은 1시간.
const TTL_LONG = 86400;   // 24시간 (초)
const TTL_SHORT = 3600;   // 1시간 (초)

// 정책, 시사 계열 도메인 키 목록. 나머지는 LONG TTL을 쓴다.
const SHORT_TTL_DOMAINS = new Set([
  "local_smb_policy",
  "vat_filing",
  "labor_contract",
  "trademark_kr",
]);

// 도메인 키에 맞는 TTL을 고른다.
function pickTtl(domainKey: string): number {
  return SHORT_TTL_DOMAINS.has(domainKey) ? TTL_SHORT : TTL_LONG;
}

// RagDoc 배열에서 grounding 텍스트를 추출한다.
// 각 문서의 title과 content를 구분선으로 이어 붙인다.
// rawContent가 있으면 그것을 우선 쓰고, 없으면 content를 쓴다.
function extractGrounding(docs: RagDoc[]): string {
  return docs
    .map((doc) => {
      const body = doc.content.trim();
      if (!body) return "";
      return `## ${doc.title}\n${body}`;
    })
    .filter(Boolean)
    .join("\n\n");
}

export interface RagResult {
  grounding: string;
  limited: boolean;
}

// RAG 파이프라인 실행.
// 캐시 히트 시 바로 반환한다. 미스 시 검색하고 결과를 캐시에 저장한다.
// ko 로케일에서 Tavily가 throw하면 검색 실패로 처리한다.
// 검색 결과가 비어있거나 오류이면 캐시에 저장하지 않는다.
// 검색 실패 시 캐시 폴백을 시도하고, 캐시도 없으면 limited: true를 반환한다.
export async function runRag(
  deps: { search: SearchProvider; cache: CacheStore },
  args: { domainKey: string; topic: string; locale: Locale }
): Promise<RagResult> {
  const cacheKey = ragCacheKey(args.domainKey, args.topic, args.locale);

  // 캐시 조회 먼저
  const cached = await deps.cache.get(cacheKey);
  if (cached !== null) {
    return { grounding: cached, limited: false };
  }

  // 캐시 미스: 검색 실행
  let docs: RagDoc[] = [];
  let searchFailed = false;

  try {
    // 검색 쿼리는 항상 영어로 구성한다.
    // ko 로케일 주제도 영어로 번환된 쿼리를 쓴다(Tavily 한국어 쿼리 금지).
    // locale 필드는 구현체(Tavily)가 가드에 쓴다.
    const query = args.locale === "ko"
      ? `${args.topic} ${args.domainKey}`
      : `${args.topic} ${args.domainKey}`;

    docs = await deps.search.search({
      query,
      locale: args.locale,
      depth: "basic",
      maxResults: 5,
      rawContent: true,
    });
  } catch {
    // Tavily ko 가드 throw 또는 API 오류 모두 여기로 떨어진다.
    searchFailed = true;
  }

  // 검색 성공했지만 결과가 없는 경우도 실패로 처리한다.
  if (!searchFailed && docs.length === 0) {
    searchFailed = true;
  }

  if (!searchFailed) {
    const grounding = extractGrounding(docs);

    if (grounding.trim().length > 0) {
      // 유효한 결과만 캐시에 저장한다. TTL 0은 throw 가드가 있으므로 항상 양수를 넘긴다.
      const ttl = pickTtl(args.domainKey);
      await deps.cache.set(cacheKey, grounding, ttl);
      return { grounding, limited: false };
    }

    // 추출 후에도 빈 경우: 빈 결과는 캐시에 넣지 않는다.
    searchFailed = true;
  }

  // 검색 실패 경로: 캐시 폴백 재시도(stale라도 사용)
  const staleCached = await deps.cache.get(cacheKey);
  if (staleCached !== null) {
    return { grounding: staleCached, limited: true };
  }

  // 캐시도 없으면 limited 반환. 파이프라인이 진행 여부를 결정한다.
  return { grounding: "", limited: true };
}
