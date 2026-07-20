// 프롬프트 패리티 게이트(SoT §2-1·§8). 프롬프트 빌더가 shared→core로 이동하며
// 타입 게이트가 못 잡는 "텍스트 소실/변조"를 막는다: v1 골든 베이스라인의 모든 프롬프트 문구가
// v2 core/prompts 문자열 집합에 그대로 존재해야 한다(v1 ⊆ v2. v2 신규 추가는 허용 — 방향성 검사).
//
// 사용:
//   node packages/scripts/prompt-parity.mjs --gen   v1 소스에서 베이스라인을 (재)생성한다(의도된 변경 시에만).
//   node packages/scripts/prompt-parity.mjs          v2를 베이스라인에 대조한다(기본 = 게이트).
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".."); // v2/app
const V1_PROMPTS = resolve(APP_ROOT, "../../v1/sidetab/packages/shared/prompts/index.ts");
const V2_PROMPTS_DIR = resolve(APP_ROOT, "packages/core/src/prompts");
const BASELINE = resolve(APP_ROOT, "packages/scripts/prompt-baseline.v1.txt");
const MIN_LEN = 16; // 이 길이 이상만 "의미 있는 문구"로 취급(짧은 구분자·enum 키 제외).

// 문자열 리터럴 추출기(single/double/template). 주석 제거, 템플릿 보간(${...})은 정적 분절로 쪼갠다.
// 중첩 템플릿까지 스택으로 처리한다. v1·v2에 동일 적용되므로 추출 방식이 일관되면 대조는 유효하다.
function extractStringLiterals(src) {
  const out = [];
  const n = src.length;
  let i = 0;
  const stack = [{ type: "code" }];
  let buf = "";
  const top = () => stack[stack.length - 1];
  while (i < n) {
    const t = top().type;
    const ch = src[i];
    const ch2 = src[i + 1];
    if (t === "code") {
      if (ch === "/" && ch2 === "/") { i += 2; while (i < n && src[i] !== "\n") i++; continue; }
      if (ch === "/" && ch2 === "*") { i += 2; while (i < n && !(src[i] === "*" && src[i + 1] === "/")) i++; i += 2; continue; }
      if (ch === "'") { stack.push({ type: "sq" }); buf = ""; i++; continue; }
      if (ch === '"') { stack.push({ type: "dq" }); buf = ""; i++; continue; }
      if (ch === "`") { stack.push({ type: "tl" }); buf = ""; i++; continue; }
      if (top().interp && ch === "{") { top().brace++; i++; continue; }
      if (top().interp && ch === "}") {
        top().brace--;
        if (top().brace === 0) { stack.pop(); buf = ""; i++; continue; }
        i++; continue;
      }
      i++; continue;
    }
    if (t === "sq" || t === "dq") {
      const q = t === "sq" ? "'" : '"';
      if (ch === "\\") { buf += ch + (src[i + 1] ?? ""); i += 2; continue; }
      if (ch === q) { if (buf.length) out.push(buf); stack.pop(); i++; continue; }
      buf += ch; i++; continue;
    }
    // template literal
    if (ch === "\\") { buf += ch + (src[i + 1] ?? ""); i += 2; continue; }
    if (ch === "`") { if (buf.length) out.push(buf); stack.pop(); i++; continue; }
    if (ch === "$" && ch2 === "{") {
      if (buf.length) out.push(buf);
      buf = "";
      stack.push({ type: "code", interp: true, brace: 1 });
      i += 2; continue;
    }
    buf += ch; i++; continue;
  }
  return out;
}

// import/export 모듈 스펙파이어(경로 문자열)는 프롬프트 내용이 아니다 — 추출 전에 중화한다.
// (v1↔v2는 import 경로가 다르므로 이걸 남기면 오검출이 난다.)
function stripModuleSpecifiers(src) {
  return src
    .replace(/\bfrom\s*(["'])[^"']*\1/g, "from _")
    .replace(/\bimport\s*(["'])[^"']*\1/g, "import _");
}

function phrasesOf(src) {
  return extractStringLiterals(stripModuleSpecifiers(src))
    .map((s) => s.trim())
    .filter((s) => s.length >= MIN_LEN);
}

function v2Corpus() {
  const files = readdirSync(V2_PROMPTS_DIR).filter((f) => f.endsWith(".ts"));
  const set = new Set();
  for (const f of files) {
    for (const p of phrasesOf(readFileSync(join(V2_PROMPTS_DIR, f), "utf-8"))) set.add(p);
  }
  return set;
}

if (process.argv.includes("--gen")) {
  const phrases = [...new Set(phrasesOf(readFileSync(V1_PROMPTS, "utf-8")))].sort();
  writeFileSync(BASELINE, phrases.join("\n") + "\n", "utf-8");
  console.log(`프롬프트 베이스라인 생성: ${phrases.length}개 문구 → ${BASELINE}`);
  process.exit(0);
}

// 기본: 게이트.
let baseline;
try {
  baseline = readFileSync(BASELINE, "utf-8").split("\n").map((l) => l.trim()).filter(Boolean);
} catch {
  console.error(`프롬프트 베이스라인 없음(${BASELINE}). 먼저 --gen으로 생성하세요.`);
  process.exit(1);
}
const corpus = v2Corpus();
const missing = baseline.filter((p) => !corpus.has(p));

if (missing.length) {
  console.error(`프롬프트 패리티 실패 — v1 문구 ${missing.length}건이 v2 core/prompts에서 소실/변조됨:`);
  for (const m of missing.slice(0, 20)) console.error("  · " + (m.length > 120 ? m.slice(0, 117) + "..." : m));
  if (missing.length > 20) console.error(`  ...외 ${missing.length - 20}건`);
  console.error("\n프롬프트는 v1 대비 의미 변경 0이어야 한다. 의도된 변경이면 --gen으로 베이스라인을 갱신하라(리뷰 대상).");
  process.exit(1);
}
console.log(`프롬프트 패리티 통과: v1 베이스라인 ${baseline.length}개 문구 전부 v2에 보존(v2 총 ${corpus.size}개).`);
