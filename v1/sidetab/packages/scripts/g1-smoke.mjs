// G1 smoke (Tier-0 pre-blocker). Validates the core unknowns with LIVE calls:
//  (1) English RAG (Tavily) -> Korean one-pass (DeepSeek)
//  (2) json_object + thinking=disabled combo
//  (3) term-boundary flush in a stream (TTFT to first term)
//  (4) flash vs pro parity
//  (5) prompt1 OOV -> enum-key behavior
// Korean output is written to a UTF-8 file; console prints ASCII status only.
// Run: node --env-file=sidetab/.env sidetab/packages/scripts/g1-smoke.mjs
import { writeFileSync } from "node:fs";

const env = process.env;
const DS = "https://api.deepseek.com/chat/completions";
const log = [];
const C = (s) => console.log(s); // ASCII only

const JOB = "보고서작성·의사결정·서류제출·이해학습·진단판단·문제해결·협상설득준비·전문가면담준비·기획전략";

// 3 builder cases incl. a hard domain (financial) and a Korea-specific one (OOV/locale check is separate).
const CASES = [
  { area: "로봇 제어", job_type: ["문제해결"], topic: "PID 제어 튜닝", en_query: "PID controller tuning robotics anti-windup gains", gap_type: ["d"], must: ["적분", "미분", "비례", "와인드업", "오버슈트"] },
  { area: "재무 모델링", job_type: ["의사결정"], topic: "스타트업 밸류에이션", en_query: "startup valuation methods DCF comparables cap table dilution", gap_type: ["c", "d"], must: ["할인", "희석", "캡테이블", "배수", "런웨이"] },
  { area: "결제 정산 시스템", job_type: ["기획전략"], topic: "정산 주기와 수수료 구조", en_query: "payment settlement cycle reconciliation interchange fee chargeback", gap_type: ["d"], must: ["정산", "수수료", "차지백", "에스크로", "대사"] },
];

async function tavily(query) {
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.TAVILY_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, search_depth: "advanced", max_results: 4, include_raw_content: true }),
  });
  if (!r.ok) throw new Error(`tavily HTTP ${r.status} ${(await r.text()).slice(0, 160)}`);
  const j = await r.json();
  const facts = (j.results || []).map((x) => `- (${x.title}) ${(x.raw_content || x.content || "").slice(0, 900)}`).join("\n");
  return { facts, sources: (j.results || []).map((x) => x.url) };
}

function prompt3(cs, grounding) {
  const sys = [
    "너는 비전공자가 그 분야로 무언가 만들기 전에 알아야 할 '핵심 어휘(말그릇)'를 골라주는 도우미다.",
    "모든 출력은 한국어로, 비전공자 눈높이로 쓴다(P15).",
    "커버리지 규칙(P31): 입력·근거·분야명에 명시된 핵심 용어는 반드시 terms에 포함(누락 금지). 표층 동의어로 슬롯 낭비 말고 그 분야 must-know·자주 혼동되는 핵심으로 5~8슬롯을 채운다. 정의는 정밀하게(메커니즘/프로토콜·비율/기준·기본/파생 구분).",
    "근거(grounding)는 영어 자료다. 영어 자료를 읽고 한국어 말그릇으로 변환해 출력한다(영어 용어는 한국어 정착어로, 없으면 한국어+괄호 원어).",
    "출력은 JSON 객체 하나. 형식: {\"terms\":[{term, kind, priority, why, one_line, tag, direction?, context_note?}]}. priority는 1이 최우선(오름차순). why는 '당신 상황엔 이게 N순위'의 근거. tag는 항상 \"몰라\"로 둔다.",
    "반드시 유효한 json만 출력한다.",
  ].join("\n");
  const user = [
    `area(분야): ${cs.area}`,
    `job_type(작업유형, 허용값 ${JOB}): ${cs.job_type.join(", ")}`,
    `gap_type(막힘 유형 a~e): ${cs.gap_type.join(", ")}`,
    `사용자가 하려는 것(topic): ${cs.topic}`,
    `참고 근거(영어 웹 검색 결과):\n${grounding}`,
    "이 상황 최우선 어휘 5~8개를 우선순위 순으로 json으로 추천하라.",
  ].join("\n");
  return [{ role: "system", content: sys }, { role: "user", content: user }];
}

function body(model, messages, { stream }) {
  return JSON.stringify({
    model,
    messages,
    stream,
    response_format: { type: "json_object" },
    thinking: { type: "disabled" }, // research-confirmed low-TTFT path
    max_tokens: 2000,
  });
}

async function callJson(model, messages) {
  const t0 = Date.now();
  const r = await fetch(DS, { method: "POST", headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" }, body: body(model, messages, { stream: false }) });
  if (!r.ok) throw new Error(`deepseek HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const j = await r.json();
  const txt = j.choices?.[0]?.message?.content ?? "";
  let parsed = null, parseErr = null;
  try { parsed = JSON.parse(txt); } catch (e) { parseErr = String(e.message); }
  return { ms: Date.now() - t0, raw: txt, parsed, parseErr, usage: j.usage };
}

async function callStream(model, messages) {
  const t0 = Date.now();
  const r = await fetch(DS, { method: "POST", headers: { Authorization: `Bearer ${env.DEEPSEEK_API_KEY}`, "Content-Type": "application/json" }, body: body(model, messages, { stream: true }) });
  if (!r.ok) throw new Error(`deepseek stream HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  const reader = r.body.getReader();
  const dec = new TextDecoder();
  let buf = "", full = "", ttfb = null, firstTermMs = null, termCount = 0;
  let seen = ""; // accumulates content to detect completed term objects within "terms":[ ... ]
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      const s = line.trim();
      if (!s || s.startsWith(":")) continue; // keep-alive comment
      if (!s.startsWith("data:")) continue;
      const data = s.slice(5).trim();
      if (data === "[DONE]") continue;
      let chunk; try { chunk = JSON.parse(data); } catch { continue; }
      const delta = chunk.choices?.[0]?.delta?.content ?? "";
      if (delta) {
        if (ttfb === null) ttfb = Date.now() - t0;
        full += delta; seen += delta;
        // heuristic term-boundary: each completed "{...}" object inside the terms array
        const m = seen.match(/\{[^{}]*\}/g);
        if (m && m.length > termCount) {
          if (firstTermMs === null) firstTermMs = Date.now() - t0;
          termCount = m.length;
        }
      }
    }
  }
  let parsed = null, parseErr = null;
  try { parsed = JSON.parse(full); } catch (e) { parseErr = String(e.message); }
  return { ttfbMs: ttfb, firstTermMs, streamedTermObjs: termCount, raw: full, parsed, parseErr };
}

function coverage(parsed, must) {
  if (!parsed?.terms) return { hit: 0, of: must.length, terms: [] };
  const blob = JSON.stringify(parsed.terms);
  const hit = must.filter((k) => blob.includes(k));
  return { hit: hit.length, of: must.length, missing: must.filter((k) => !blob.includes(k)), terms: parsed.terms.map((t) => t.term) };
}

// ---- run ----
for (const cs of CASES) {
  const entry = { area: cs.area, topic: cs.topic };
  try {
    const { facts, sources } = await tavily(cs.en_query);
    entry.tavily = { sources, facts_chars: facts.length };
    const msgs = prompt3(cs, facts);

    const flash = await callJson("deepseek-v4-flash", msgs);
    entry.flash = { ms: flash.ms, parseOk: !!flash.parsed, parseErr: flash.parseErr, coverage: coverage(flash.parsed, cs.must), terms: flash.parsed?.terms, usage: flash.usage };
    C(`[flash] ${cs.area}: ${flash.ms}ms parseOk=${!!flash.parsed} cov=${entry.flash.coverage.hit}/${entry.flash.coverage.of}`);

    const stream = await callStream("deepseek-v4-flash", msgs);
    entry.flash_stream = { ttfbMs: stream.ttfbMs, firstTermMs: stream.firstTermMs, streamedTermObjs: stream.streamedTermObjs, parseOk: !!stream.parsed, parseErr: stream.parseErr };
    C(`[flash-stream] ${cs.area}: ttfb=${stream.ttfbMs}ms firstTerm=${stream.firstTermMs}ms streamedObjs=${stream.streamedTermObjs} parseOk=${!!stream.parsed}`);

    if (cs === CASES[0]) {
      const pro = await callJson("deepseek-v4-pro", msgs);
      entry.pro = { ms: pro.ms, parseOk: !!pro.parsed, coverage: coverage(pro.parsed, cs.must), terms: pro.parsed?.terms };
      C(`[pro] ${cs.area}: ${pro.ms}ms parseOk=${!!pro.parsed} cov=${entry.pro.coverage.hit}/${entry.pro.coverage.of}`);
    }
  } catch (e) {
    entry.error = String(e.message || e);
    C(`[ERROR] ${cs.area}: ${entry.error}`);
  }
  log.push(entry);
}

// (5) prompt1 OOV -> enum key behavior: feed an out-of-map free sentence, check domain/job_type/condition_required
try {
  const sys = `너는 사용자의 자유문장을 읽고 분야와 작업유형을 추론한다. job_type 허용값(이 중에서만 골라라, 키 변동 금지): ${JOB}. 출력은 json 하나: {"domain": "...", "job_type": ["..."], "condition_required": true/false, "question": "...", "choices": ["...","...","..."]}. 반드시 유효한 json.`;
  const user = "자유문장: '동네에서 무인 밀키트 자판기 사업을 해보려는데 뭘 알아야 할지 모르겠어요'";
  const r = await callJson("deepseek-v4-flash", [{ role: "system", content: sys }, { role: "user", content: user }]);
  const ok = r.parsed && JOB.split("·").includes((r.parsed.job_type || [])[0]);
  log.push({ prompt1_oov: { parseOk: !!r.parsed, job_type: r.parsed?.job_type, domain: r.parsed?.domain, condition_required: r.parsed?.condition_required, job_in_enum: ok } });
  C(`[prompt1-oov] parseOk=${!!r.parsed} job_in_enum=${ok} domain=${JSON.stringify(r.parsed?.domain)}`);
} catch (e) {
  log.push({ prompt1_oov_error: String(e.message || e) });
  C(`[ERROR] prompt1-oov: ${String(e.message || e)}`);
}

const outPath = new URL("./g1-result.json", import.meta.url);
writeFileSync(outPath, JSON.stringify(log, null, 2), "utf-8");
C(`\nWROTE ${outPath.pathname}`);
