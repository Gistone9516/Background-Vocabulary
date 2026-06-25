// 통합 런타임 e2e (buildflow stage 4 integration test = G2 RAG + G3 streaming).
// 실제 파이프라인 클래스를 .env로 조립해 classify, recommendStream, 고위험 게이트를 검증한다.
// Run: node --env-file=sidetab/.env --import tsx packages/scripts/e2e.ts
import { writeFileSync } from "node:fs";
import { DeepSeekLlmClient } from "@sidetab/core/llm";
import { TavilySearchProvider } from "@sidetab/providers/tavily";
import { UpstashCacheStore } from "@sidetab/providers/upstash-cache";
import { createPipeline } from "@sidetab/core/pipeline";
import type { StreamEvent, RecommendInput } from "@sidetab/shared";

const env = process.env;
const C = (s: string) => console.log(s);
const out: any = {};

const llm = new DeepSeekLlmClient({ apiKey: env.DEEPSEEK_API_KEY! });
const search = new TavilySearchProvider({ apiKey: env.TAVILY_API_KEY! });
const cache = new UpstashCacheStore({ url: env.UPSTASH_REDIS_REST_URL!, token: env.UPSTASH_REDIS_REST_TOKEN! });
const pipeline = createPipeline({ llm, search, cache });

async function drain(stream: ReadableStream<StreamEvent>) {
  const reader = stream.getReader();
  const terms: any[] = [];
  let firstTermMs: number | null = null;
  let error: any = null;
  let done = false;
  const t0 = Date.now();
  while (true) {
    const { done: d, value } = await reader.read();
    if (d) break;
    if (value.type === "term") {
      if (firstTermMs === null) firstTermMs = Date.now() - t0;
      terms.push(value.term);
    } else if (value.type === "error") {
      error = { code: value.code, message: value.message };
    } else if (value.type === "done") {
      done = true;
    }
  }
  return { terms, firstTermMs, error, done };
}

// Test 1: classify (프롬프트1)
try {
  const p1 = await pipeline.classify({ raw_input: "로봇 팔 PID 제어 튜닝을 하려고 한다" });
  out.classify = { domain: p1.domain, job_type: p1.job_type, search_locale: p1.search_locale, domain_risk: p1.domain_risk, condition_required: p1.condition_required, choices: p1.choices?.length };
  C(`[classify] domain=${p1.domain} locale=${p1.search_locale} risk=${p1.domain_risk} jobs=${JSON.stringify(p1.job_type)} choices=${p1.choices?.length}`);
} catch (e: any) {
  out.classify = { error: String(e.message || e) };
  C(`[classify] ERROR ${String(e.message || e)}`);
}

// Test 2: recommendStream (RAG -> 한국어 term 스트리밍, 저위험)
try {
  const input: RecommendInput = { area: "로봇 제어", domain: "robotics", topic: "PID 제어 튜닝", locale: "en", job_type: ["문제해결"], gap_type: ["d"], domain_risk: "low" };
  const r = await drain(pipeline.recommendStream(input, "paid"));
  out.recommend = { term_count: r.terms.length, firstTermMs: r.firstTermMs, done: r.done, error: r.error, terms: r.terms };
  C(`[recommend] terms=${r.terms.length} firstTerm=${r.firstTermMs}ms done=${r.done} error=${JSON.stringify(r.error)}`);
} catch (e: any) {
  out.recommend = { error: String(e.message || e) };
  C(`[recommend] ERROR ${String(e.message || e)}`);
}

// Test 3: 고위험 게이트 (medical_personal -> error 이벤트, LLM 호출 없이 거부)
try {
  const input: RecommendInput = { area: "갑상선 결절 진단 해석", domain: "medical_personal", topic: "갑상선 결절 양성 악성 판정", locale: "ko", job_type: ["진단판단"], domain_risk: "high" };
  const r = await drain(pipeline.recommendStream(input, "paid"));
  out.highrisk = { refused: r.error?.code === "HIGH_RISK_REFUSED", error: r.error, term_count: r.terms.length };
  C(`[highrisk] refused=${r.error?.code === "HIGH_RISK_REFUSED"} error=${JSON.stringify(r.error)} terms=${r.terms.length}`);
} catch (e: any) {
  out.highrisk = { error: String(e.message || e) };
  C(`[highrisk] ERROR ${String(e.message || e)}`);
}

// Test 4: nextBranch (프롬프트2) — 종료 신호 enough/confidence 산출 확인
try {
  const p2 = await pipeline.nextBranch({ domain: "robotics", job_type: ["문제해결"], history: [{ label: "정확도·품질 높이기", action: "선택" }] });
  out.next = { question: p2.question, choices: p2.choices?.length, enough: p2.enough, confidence: p2.confidence };
  C(`[next] enough=${p2.enough} confidence=${p2.confidence} choices=${p2.choices?.length}`);
} catch (e: any) {
  out.next = { error: String(e.message || e) };
  C(`[next] ERROR ${String(e.message || e)}`);
}

// Test 5: detail (프롬프트5) — 3단 본문 + 출처(sources) 산출 확인
try {
  const p5 = await pipeline.detail({ term: "적분기 와인드업", kind: "현상", area: "로봇 제어", job_type: ["문제해결"], domain: "robotics", topic: "PID 제어 튜닝", locale: "en" }, "paid");
  out.detail = { what: !!p5.what, whymine: !!p5.whymine, how: !!p5.how, related: p5.related?.length, sources: p5.sources?.length, sourcesSample: p5.sources?.slice(0, 2) };
  C(`[detail] what=${!!p5.what} whymine=${!!p5.whymine} how=${!!p5.how} related=${p5.related?.length} sources=${p5.sources?.length}`);
} catch (e: any) {
  out.detail = { error: String(e.message || e) };
  C(`[detail] ERROR ${String(e.message || e)}`);
}

// Test 6: exclude 페이지네이션 — 1차 어휘를 제외하고 다음 우선순위만 나오는지(중복 0 기대)
try {
  const excluded: string[] = (out.recommend?.terms || []).map((t: any) => t.term).slice(0, 3);
  const input2: RecommendInput = { area: "로봇 제어", domain: "robotics", topic: "PID 제어 튜닝", locale: "en", job_type: ["문제해결"], domain_risk: "low", exclude: excluded };
  const r2 = await drain(pipeline.recommendStream(input2, "paid"));
  const overlap = (r2.terms || []).filter((t: any) => excluded.includes(t.term)).length;
  out.exclude = { excluded, term_count: r2.terms.length, overlap_with_excluded: overlap, terms: r2.terms.map((t: any) => t.term) };
  C(`[exclude] excluded=${excluded.length} terms=${r2.terms.length} overlap=${overlap}`);
} catch (e: any) {
  out.exclude = { error: String(e.message || e) };
  C(`[exclude] ERROR ${String(e.message || e)}`);
}

// Test 7: 앵커 제외(P31 개정) — 사용자가 이미 쓴 상위어는 추천에서 빠지고 실용·방법론 어휘가 나오는지
try {
  const raw = "거시경제 데이터를 계량경제학과 머신러닝으로 교차 분석하려고 한다";
  const c = await pipeline.classify({ raw_input: raw });
  const input: RecommendInput = { area: c.domain, domain: "other", topic: raw, locale: c.search_locale, job_type: c.job_type, domain_risk: c.domain_risk };
  const r = await drain(pipeline.recommendStream(input, "paid"));
  const names = r.terms.map((t: any) => t.term);
  const anchors = ["계량경제학", "머신러닝", "econometrics", "machine learning", "거시경제"];
  const norm = (s: string) => s.replace(/\s/g, "").toLowerCase();
  const leaked = names.filter((n: string) => anchors.some((a) => norm(n).includes(norm(a))));
  out.anchor = { area: c.domain, term_count: r.terms.length, anchors_leaked: leaked, terms: names, sample: r.terms.slice(0, 4).map((t: any) => ({ term: t.term, kind: t.kind, one_line: t.one_line })) };
  C(`[anchor] area=${c.domain} terms=${r.terms.length} leaked=${JSON.stringify(leaked)}`);
  C(`[anchor] terms: ${names.join(", ")}`);
} catch (e: any) {
  out.anchor = { error: String(e.message || e) };
  C(`[anchor] ERROR ${String(e.message || e)}`);
}

const outPath = new URL("./e2e-result.json", import.meta.url);
writeFileSync(outPath, JSON.stringify(out, null, 2), "utf-8");
C(`\nWROTE ${outPath.pathname}`);
