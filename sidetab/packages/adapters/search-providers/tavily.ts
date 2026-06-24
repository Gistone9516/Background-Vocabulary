// Tavily 검색 공급자. 영어 전용이며 한국어 요청은 즉시 오류를 던진다.
// Tavily는 한국어 콘텐츠를 심하게 잘라내는 결함이 확인되어 ko 경로에서 사용하지 않는다.

import type { SearchProvider } from "@sidetab/shared";
import type { RagDoc, Locale } from "@sidetab/shared";

// Tavily 응답 결과 항목 형태.
interface TavilyResult {
  title: string;
  url: string;
  content: string;
  raw_content?: string;
}

// Tavily API 응답 전체 형태.
interface TavilyResponse {
  results: TavilyResult[];
}

// raw_content 또는 content를 잘라내는 최대 길이(문자 수).
const MAX_CONTENT_CHARS = 900;

export class TavilySearchProvider implements SearchProvider {
  private readonly apiKey: string;

  constructor(opts: { apiKey: string }) {
    this.apiKey = opts.apiKey;
  }

  async search(q: {
    query: string;
    locale: Locale;
    depth: "basic" | "advanced";
    maxResults: number;
    rawContent: boolean;
  }): Promise<RagDoc[]> {
    // Tavily는 한국어 콘텐츠를 지원하지 않는다. ko가 오면 오류를 던져 라우터가 대체 공급자로 전환하게 한다.
    if (q.locale === "ko") {
      throw new Error(
        "TavilySearchProvider는 한국어(ko)를 지원하지 않는다. ko 경로에는 별도 한국어 공급자를 사용해야 한다."
      );
    }

    const body = {
      query: q.query,
      search_depth: q.depth,
      max_results: q.maxResults,
      include_raw_content: q.rawContent,
    };

    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "(응답 본문 없음)");
      throw new Error(
        `Tavily API 오류 ${res.status}: ${text}`
      );
    }

    const data = (await res.json()) as TavilyResponse;

    return data.results.map((r): RagDoc => {
      // raw_content가 있으면 우선 사용하고 없으면 content로 대체한다.
      const fullContent = r.raw_content ?? r.content ?? "";
      const content = fullContent.slice(0, MAX_CONTENT_CHARS);

      return {
        title: r.title,
        url: r.url,
        content,
      };
    });
  }
}
