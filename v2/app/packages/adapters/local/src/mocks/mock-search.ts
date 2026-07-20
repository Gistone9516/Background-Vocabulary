// 목 검색 어댑터(mock 계층). 결과 없음을 반환해 RAG의 근거 제한(limited) 경로를 결정적으로 관통시킨다.
// 실 검색(Tavily REST, ko 한국어 금지 가드)은 C2에서 같은 SearchProvider 포트로 구현한다.

import type { SearchProvider, RagDoc } from "@vock/shared";

export class MockSearchProvider implements SearchProvider {
  async search(_q: {
    query: string;
    locale: "en" | "ko";
    depth: "basic" | "advanced";
    maxResults: number;
    rawContent: boolean;
  }): Promise<RagDoc[]> {
    return [];
  }
}
