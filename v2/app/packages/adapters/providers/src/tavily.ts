// Tavily 검색 공급자(영어 전용). 한국어(ko)는 즉시 throw — Tavily가 한국어를 심하게 잘라내는 결함. v1 이식.

import type { SearchProvider, RagDoc, Locale } from "@vock/shared";

interface TavilyResult {
  title: string;
  url: string;
  content: string;
  raw_content?: string;
}
interface TavilyResponse {
  results: TavilyResult[];
}

const MAX_CONTENT_CHARS = 900;

export class TavilySearchProvider implements SearchProvider {
  private readonly apiKey: string;
  constructor(opts: { apiKey: string }) {
    this.apiKey = opts.apiKey;
  }

  async search(q: { query: string; locale: Locale; depth: "basic" | "advanced"; maxResults: number; rawContent: boolean }): Promise<RagDoc[]> {
    if (q.locale === "ko") {
      throw new Error("TavilySearchProvider는 한국어(ko)를 지원하지 않는다. ko 경로에는 별도 한국어 공급자를 사용해야 한다.");
    }
    const body = { query: q.query, search_depth: q.depth, max_results: q.maxResults, include_raw_content: q.rawContent };
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "(응답 본문 없음)");
      throw new Error(`Tavily API 오류 ${res.status}: ${text}`);
    }
    const data = (await res.json()) as TavilyResponse;
    return data.results.map((r): RagDoc => {
      const fullContent = r.raw_content ?? r.content ?? "";
      return { title: r.title, url: r.url, content: fullContent.slice(0, MAX_CONTENT_CHARS) };
    });
  }
}
