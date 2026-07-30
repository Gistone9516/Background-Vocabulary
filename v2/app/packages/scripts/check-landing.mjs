// 랜딩 게이트(L-1·L-3·L-4). 빌드해서 산출물을 검사한다.
//
// 왜 소스가 아니라 산출물인가: JS가 생기는 경로는 <script> 태그만이 아니다. 아일랜드 통합,
// 클라이언트 지시자(client:load 등), 일부 통합의 자동 주입이 모두 빌드 시점에 JS를 만든다.
// 소스를 grep하면 그 경로들을 하나씩 쫓아야 하고, 새 경로가 생기면 조용히 통과한다.
// **산출물에 JS가 없다는 것이 규칙이므로 산출물을 본다.**
//
// 왜 gate 체인에 넣는가: 랜딩의 존재 이유가 "AI 크롤러가 읽을 수 있는 HTML"이고(ADR-002),
// JS가 들어가는 순간 그 이유가 사라진다. 사라져도 화면은 정상으로 보이므로 사람이 못 알아챈다.
//
//   node packages/scripts/check-landing.mjs
//
// 빌드를 스크립트가 직접 돌린다(약 2초). 빌드를 앞 단계에 맡기면 산출물이 낡았을 때
// 통과·실패가 둘 다 거짓이 된다.

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative, resolve } from "node:path";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const LANDING = join(APP_ROOT, "packages", "landing");
const DIST = join(LANDING, "dist");

// 운영이 바꾸는 수치를 문구에 박지 않는다(L-4·L-4b). 정본 없는 가격도 금지(L-3).
// 통화 기호 + 숫자, 그리고 한도를 단정하는 표현을 본다. 자산 파일명의 해시는 검사 대상이 아니므로
// HTML만 훑는다.
const FORBIDDEN_TEXT = [
  { re: /[₩$€¥]\s?[\d,]+/, msg: "가격으로 보이는 숫자 — v2 정본 가격이 없다(L-3)" },
  // `\b`를 쓰지 않는다. `원`은 비단어 문자라 그 뒤에 단어 경계가 성립하지 않고, 그래서
  // "월 3,900원"이 통과했다(실측으로 잡았다).
  { re: /[\d,]+\s*원/, msg: "가격으로 보이는 숫자(원) — v2 정본 가격이 없다(L-3)" },
  { re: /주\s*\d+\s*회/, msg: "주간 한도 수치 — env로 덮이는 값이다(L-4)" },
  { re: /하루\s*\d+\s*회/, msg: "일간 한도 수치 — env로 덮이는 값이다(L-4)" },
  { re: /무료로?\s*\d+\s*(개|회|번)/, msg: "무료 한도 수치 — env로 덮이는 값이다(L-4)" },
];

function walk(dir) {
  let out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else out.push(p);
  }
  return out;
}

if (!existsSync(LANDING)) {
  console.log("랜딩 게이트 건너뜀: packages/landing 이 없다.");
  process.exit(0);
}

// 타입 검사와 빌드를 여기서 함께 돈다.
//
// 체인에 `pnpm --dir ...`을 두었다가 실패했다: 이 환경에는 전역 pnpm shim이 없어 `corepack pnpm`
// 으로만 부를 수 있고, 그래서 게이트를 `npm run gate`로 부르면 그 줄에서 죽었다. 게이트가 어느
// 패키지 매니저로 호출됐는지에 따라 결과가 달라지면 게이트가 아니다. npm은 항상 있으므로 npm으로 부른다.
function run(step, args) {
  try {
    execFileSync("npm", ["run", step, "--silent"], { cwd: LANDING, stdio: "pipe", shell: true, ...args });
  } catch (e) {
    console.error(`랜딩 게이트 실패 — ${step}이 깨졌다:`);
    console.error(String(e.stdout ?? "") + String(e.stderr ?? ""));
    process.exit(1);
  }
}
run("check"); // astro check = .astro 타입 검사
run("build");

const violations = [];
const files = walk(DIST);
const html = files.filter((f) => f.endsWith(".html"));
const js = files.filter((f) => /\.(js|mjs)$/.test(f));

// 1. 산출물에 JS 파일 자체가 없어야 한다.
for (const f of js) violations.push(`${relative(APP_ROOT, f)}\n    JS 파일이 생성됐다 — 랜딩은 JS 0이다(L-1)`);

// 2. HTML에 <script> 가 없어야 한다. 인라인·외부 모두.
for (const f of html) {
  const src = readFileSync(f, "utf-8");
  const rel = relative(APP_ROOT, f);
  const scripts = src.match(/<script\b/gi);
  if (scripts) violations.push(`${rel}\n    <script> ${scripts.length}개 — 랜딩은 JS 0이다(L-1)`);
  // 3. 금지 문구. 태그를 벗겨 본문만 본다.
  const text = src.replace(/<[^>]*>/g, " ");
  for (const { re, msg } of FORBIDDEN_TEXT) {
    const hit = text.match(re);
    if (hit) violations.push(`${rel}\n    ${msg}\n    발견: ${JSON.stringify(hit[0])}`);
  }
}

if (!html.length) {
  console.error("랜딩 게이트 실패 — 빌드 산출물에 HTML이 없다. 빌드가 아무것도 만들지 않았다.");
  process.exit(1);
}

if (violations.length) {
  console.error("랜딩 게이트 실패:");
  for (const v of violations) console.error("  " + v);
  process.exit(1);
}
console.log(`랜딩 게이트 통과: HTML ${html.length}개, JS 0개, 금지 문구 0건(L-1·L-3·L-4).`);
