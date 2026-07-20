// 이식성 가드(경계 게이트 3중 중 하나 — SoT §0-1).
// core/·shared/ 가 런타임/공급자 전용 바인딩을 쓰면 빌드를 실패시킨다.
// 인터페이스 경계가 새는 순간 "얇은 어댑터" 약속이 통째 재작성으로 붕괴하므로 첫날부터 강제한다.
// 새 루트(ui-shared 등)는 여기 ROOTS에 추가한다. 프론트 번들의 프롬프트 유출 검사(SoT §8)는 PROMPT_ROOTS로 확장한다.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

// 경로 기준 = 스크립트 위치(실행 CWD와 무관). packages/scripts → v2/app.
const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

// 웹표준만 허용하는 순수 계층.
const ROOTS = ["packages/shared/src", "packages/core/src"].map((r) => join(APP_ROOT, r));

// 프롬프트 문자열이 포함되면 안 되는 프론트 계층(SoT §8). C1에서는 아직 없음 — 생기면 추가.
const PROMPT_ROOTS = [];

// core/·shared/ 에서 금지하는 패턴. 런타임/공급자 전용이거나 어댑터 의존이면 위반.
const FORBIDDEN = [
  { re: /from\s+["']hono/, msg: "hono import (런타임 프레임워크는 adapters에만)" },
  { re: /from\s+["']@hono\//, msg: "@hono/* import (런타임 서버는 adapters에만)" },
  { re: /from\s+["'][^"']*adapters/, msg: "adapters import (core/shared는 어댑터 의존 금지)" },
  { re: /from\s+["']@aws-sdk/, msg: "@aws-sdk import (AWS 특수성은 adapters/aws에만)" },
  { re: /from\s+["']@tauri-apps/, msg: "@tauri-apps import (Tauri 특수성은 adapters/tauri에만)" },
  { re: /process\s*\.\s*env/, msg: "process.env (Node 전용; EnvConfig 주입을 쓴다)" },
  { re: /\b__dirname\b/, msg: "__dirname (Node 전용)" },
  { re: /\brequire\s*\(/, msg: "require() (CJS/Node 전용)" },
  { re: /caches\s*\.\s*default/, msg: "caches.default (런타임 전용 캐시)" },
  { re: /ctx\s*\.\s*waitUntil/, msg: "ctx.waitUntil (런타임 전용)" },
];

function walk(dir) {
  let files = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const name of entries) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files = files.concat(walk(p));
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) files.push(p);
  }
  return files;
}

const violations = [];

// 1. 순수 계층 런타임 누수 검사.
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const lines = readFileSync(file, "utf-8").split("\n");
    lines.forEach((line, i) => {
      const trimmed = line.trim();
      // 줄 전체 주석은 건너뛴다(설명문에 금지 토큰이 등장할 수 있음).
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
      for (const rule of FORBIDDEN) {
        if (rule.re.test(line)) {
          violations.push(`${file}:${i + 1}  ${rule.msg}\n    ${trimmed}`);
        }
      }
    });
  }
}

// 2. 프론트 번들 프롬프트 유출 검사(SoT §8) — 프롬프트 빌더 호출/토큰 금지.
const PROMPT_TOKENS = [/buildPrompt[1-6]\b/, /\[OUTPUT LANGUAGE/, /\[SECURITY\]/, /\[CHOICES —/];
for (const root of PROMPT_ROOTS) {
  for (const file of walk(root)) {
    const text = readFileSync(file, "utf-8");
    for (const re of PROMPT_TOKENS) {
      if (re.test(text)) {
        violations.push(`${file}  프롬프트 자산 유출(${re}) — 프론트 번들에 프롬프트 금지(SoT §8)`);
      }
    }
  }
}

if (violations.length) {
  console.error("이식성 가드 실패 — 순수 계층에 런타임/공급자 누수 또는 프론트 프롬프트 유출:");
  for (const v of violations) console.error("  " + v);
  console.error(`\n총 ${violations.length}건. 이식성 경계 위반(SoT §0-1·§8).`);
  process.exit(1);
}
console.log("이식성 가드 통과: 순수 계층 런타임 누수 0건, 프론트 프롬프트 유출 0건.");
