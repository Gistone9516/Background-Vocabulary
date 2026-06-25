// 과적합 검증: 프롬프트3 깊이 예시(계량경제)와 무관한 5개 교차전공 케이스를 실제 파이프라인(flash)으로 돌려
// ① 도메인별 전문어 깊이가 나오는지 ② 계량경제 예시어가 오염되지 않는지 ③ 앵커(입력에 쓴 용어) 제외되는지 확인.
// Run(sidetab cwd): node --env-file=.env --import tsx packages/scripts/overfit.ts
import { writeFileSync } from "node:fs";
import { DeepSeekLlmClient } from "@sidetab/core/llm";
import { TavilySearchProvider } from "@sidetab/providers/tavily";
import { UpstashCacheStore } from "@sidetab/providers/upstash-cache";
import { createPipeline } from "@sidetab/core/pipeline";
import type { StreamEvent, RecommendInput } from "@sidetab/shared";

const env = process.env;
const llm = new DeepSeekLlmClient({ apiKey: env.DEEPSEEK_API_KEY! });
const search = new TavilySearchProvider({ apiKey: env.TAVILY_API_KEY! });
const cache = new UpstashCacheStore({ url: env.UPSTASH_REDIS_REST_URL!, token: env.UPSTASH_REDIS_REST_TOKEN! });
const pipeline = createPipeline({ llm, search, cache });

async function drain(stream: ReadableStream<StreamEvent>) {
  const reader = stream.getReader();
  const terms: any[] = []; let error: any = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value.type === "term") terms.push(value.term);
    else if (value.type === "error") error = { code: value.code, message: value.message };
  }
  return { terms, error };
}

// 프롬프트3에 박힌 깊이 예시어(오염 감시용). 케이스 도메인과 무관하므로 등장하면 과적합 신호.
const CONTAM = ["정상성", "공적분", "내생성", "도구변수", "구조적 var", "nowcasting", "나우캐스팅", "시계열 교차검증"];
const norm = (s: string) => s.replace(/\s|\(|\)/g, "").toLowerCase();

const CASES = [
  { label: "결제/정산(핀테크)", raw: "쇼핑몰에 결제를 붙이려는데 PG 정산이랑 에스크로 흐름을 모르겠어" },
  { label: "캐주얼 게임 디자인", raw: "캐주얼 모바일 게임을 만드는데 코어 루프랑 리텐션 설계를 모르겠어" },
  { label: "추천시스템(ML)", raw: "사진 앱에 추천 기능을 넣고 싶은데 협업 필터링이랑 콜드스타트가 막막해" },
  { label: "쿠버네티스 배포(데브옵스)", raw: "서비스를 쿠버네티스로 배포하려는데 인그레스랑 오토스케일링을 모르겠어" },
  { label: "음악 믹싱/마스터링(창작)", raw: "곡을 만들어보려는데 믹싱이랑 마스터링에서 컴프레서랑 EQ를 모르겠어" },
];

const out: any[] = [];
for (const c of CASES) {
  try {
    const p1 = await pipeline.classify({ raw_input: c.raw });
    const input: RecommendInput = {
      area: p1.domain, domain: "other", topic: c.raw,
      locale: p1.search_locale, job_type: p1.job_type, domain_risk: p1.domain_risk,
    };
    if (p1.domain_risk === "high") { out.push({ label: c.label, area: p1.domain, refused: true }); console.log(`\n[${c.label}] 고위험 거부됨`); continue; }
    const r = await drain(pipeline.recommendStream(input));
    const names: string[] = r.terms.map((t: any) => t.term);
    const contam = names.filter((n) => CONTAM.some((x) => norm(n).includes(norm(x))));
    out.push({
      label: c.label, area: p1.domain, jobs: p1.job_type, term_count: names.length,
      contamination: contam, error: r.error,
      terms: r.terms.map((t: any) => ({ term: t.term, kind: t.kind, group: t.group, one_line: t.one_line })),
    });
    console.log(`\n[${c.label}] area=${p1.domain} jobs=${JSON.stringify(p1.job_type)} 오염=${JSON.stringify(contam)}`);
    for (const t of r.terms) console.log(`   - ${t.term} (${t.kind}) — ${t.one_line}`);
  } catch (e: any) {
    out.push({ label: c.label, error: String(e.message || e) });
    console.log(`\n[${c.label}] ERROR ${String(e.message || e)}`);
  }
}

const outPath = new URL("./overfit-result.json", import.meta.url);
writeFileSync(outPath, JSON.stringify(out, null, 2), "utf-8");
console.log(`\nWROTE ${outPath.pathname}`);
