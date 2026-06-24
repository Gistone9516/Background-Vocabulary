// G4 (로케일 분류 정확도) + G7 (프롬프트 품질 루브릭). 실제 SoT 프롬프트 빌더를 그대로 쓴다.
// Run: node --env-file=sidetab/.env --import tsx packages/scripts/g4g7.ts
import { writeFileSync } from "node:fs";
import { buildPrompt1, buildPrompt3 } from "../shared/prompts/index.js";
import type { Msg } from "../shared/interfaces.js";

const env = process.env;
const DS = "https://api.deepseek.com/chat/completions";
const C = (s: string) => console.log(s);

async function callJson<T = any>(messages: Msg[], model = "deepseek-v4-flash"): Promise<{ parsed: T | null; raw: string }> {
  const r = await fetch(DS, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, stream: false, response_format: { type: "json_object" }, thinking: { type: "disabled" }, max_tokens: 1800 }),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
  const j = await r.json();
  const raw = j.choices?.[0]?.message?.content ?? "";
  try {
    return { parsed: JSON.parse(raw) as T, raw };
  } catch {
    return { parsed: null, raw };
  }
}

async function tavily(query: string): Promise<string> {
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.TAVILY_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, search_depth: "basic", max_results: 3, include_raw_content: true }),
  });
  const j = await r.json();
  return (j.results || []).map((x: any) => `- ${(x.raw_content || x.content || "").slice(0, 700)}`).join("\n");
}

// ---------- G4: 로케일 분류 ----------
const G4: { input: string; expect_locale: "en" | "ko"; expect_high?: boolean }[] = [
  { input: "로봇 팔 PID 제어 튜닝을 하려고 한다", expect_locale: "en" },
  { input: "React 상태관리 라이브러리를 고르려고 한다", expect_locale: "en" },
  { input: "스타트업 시드 투자 피칭 덱을 만든다", expect_locale: "en" },
  { input: "머신러닝 모델을 프로덕션에 배포하려 한다", expect_locale: "en" },
  { input: "결제 시스템 정산 아키텍처를 설계한다", expect_locale: "en" },
  { input: "UX 사용성 테스트를 설계하려 한다", expect_locale: "en" },
  { input: "디자인 시스템 토큰 구조를 잡으려 한다", expect_locale: "en" },
  { input: "소상공인 정책자금 지원 사업에 신청하려 한다", expect_locale: "ko" },
  { input: "전세 계약 보증금 반환 문제를 알아보려 한다", expect_locale: "ko" },
  { input: "부가가치세 신고를 직접 하려고 한다", expect_locale: "ko" },
  { input: "근로계약서를 처음 작성해보려 한다", expect_locale: "ko" },
  { input: "국내 상표를 출원하려고 한다", expect_locale: "ko" },
  { input: "갑상선 결절 진단 결과를 직접 해석하려 한다", expect_locale: "ko", expect_high: true },
  { input: "교통사고 합의금을 변호사 없이 직접 협상하려 한다", expect_locale: "ko", expect_high: true },
];

// ---------- G7: 프롬프트3 필드 트리거 (기획 P30) ----------
const G7: {
  name: string;
  area: string;
  job_type: any[];
  gap_type: any[];
  en_query: string;
  expect_fields: string[]; // 적어도 절반 이상 term에 나타나야 하는 조건부 필드
}[] = [
  { name: "gap_c+글쓰기", area: "기술 블로그 작성", job_type: ["보고서작성"], gap_type: ["c"], en_query: "technical writing clarity active voice jargon", expect_fields: ["use_example", "direction"] },
  { name: "gap_b", area: "쿠버네티스 네트워킹", job_type: ["이해학습"], gap_type: ["b"], en_query: "kubernetes networking service ingress pod CNI relationship", expect_fields: ["relates_to", "order"] },
  { name: "gap_d+의사결정", area: "클라우드 비용 최적화", job_type: ["의사결정"], gap_type: ["d"], en_query: "cloud cost optimization reserved instances savings plan rightsizing", expect_fields: ["direction", "context_note"] },
];

const out: any = { g4: [], g7: [] };

// G4 run
let g4ok = 0, g4koAsEn = 0, g4high = 0, g4highTotal = 0;
for (const c of G4) {
  try {
    const { parsed } = await callJson(buildPrompt1(c.input));
    const loc = parsed?.search_locale;
    const risk = parsed?.domain_risk;
    const ok = loc === c.expect_locale;
    if (ok) g4ok++;
    if (c.expect_locale === "ko" && loc === "en") g4koAsEn++;
    if (c.expect_high) {
      g4highTotal++;
      if (risk === "high") g4high++;
    }
    out.g4.push({ input: c.input, expect: c.expect_locale, got_locale: loc, expect_high: !!c.expect_high, got_risk: risk, domain: parsed?.domain, job: parsed?.job_type, ok });
    C(`[G4] ${ok ? "OK " : "XX "} exp=${c.expect_locale} got=${loc} risk=${risk} :: ${c.input.slice(0, 24)}`);
  } catch (e: any) {
    out.g4.push({ input: c.input, error: String(e.message || e) });
    C(`[G4] ERR ${c.input.slice(0, 24)}: ${String(e.message || e)}`);
  }
}
const g4acc = Math.round((g4ok / G4.length) * 100);
out.g4_summary = { acc_pct: g4acc, total: G4.length, ok: g4ok, ko_misclassified_as_en: g4koAsEn, high_risk_detected: `${g4high}/${g4highTotal}` };
C(`[G4] accuracy=${g4acc}% (${g4ok}/${G4.length})  ko->en misclassified=${g4koAsEn}  high_risk=${g4high}/${g4highTotal}`);

// G7 run
for (const c of G7) {
  try {
    const grounding = await tavily(c.en_query);
    const { parsed } = await callJson(buildPrompt3({ area: c.area, job_type: c.job_type, gap_type: c.gap_type, grounding }));
    const terms = parsed?.terms ?? [];
    const fieldHit: Record<string, number> = {};
    for (const f of c.expect_fields) fieldHit[f] = terms.filter((t: any) => t[f] != null && (Array.isArray(t[f]) ? t[f].length : String(t[f]).length) > 0).length;
    const koBeginnerOk = terms.length > 0 && terms.every((t: any) => typeof t.one_line === "string" && t.one_line.length > 5 && typeof t.why === "string");
    const priOk = terms.length > 0 && terms.every((t: any, i: number) => typeof t.priority === "number");
    out.g7.push({ name: c.name, term_count: terms.length, expect_fields: c.expect_fields, field_hit: fieldHit, beginner_ok: koBeginnerOk, priority_ok: priOk, terms: terms.map((t: any) => t.term) });
    C(`[G7] ${c.name}: terms=${terms.length} fields=${JSON.stringify(fieldHit)} beginner=${koBeginnerOk} prio=${priOk}`);
  } catch (e: any) {
    out.g7.push({ name: c.name, error: String(e.message || e) });
    C(`[G7] ERR ${c.name}: ${String(e.message || e)}`);
  }
}

const outPath = new URL("./g4g7-result.json", import.meta.url);
writeFileSync(outPath, JSON.stringify(out, null, 2), "utf-8");
C(`\nWROTE ${outPath.pathname}`);
