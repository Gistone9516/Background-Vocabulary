// 이식성 가드 (AWS Lambda 이식 1순위 제약 — 구현계획 §3-1, 인터페이스계약 §0-1).
// core/ 와 shared/ 가 런타임 전용 바인딩이나 모듈을 쓰면 빌드를 실패시킨다.
// 인터페이스 경계가 새는 순간 "얇은 어댑터" 약속이 통째 재작성으로 붕괴하므로 첫날부터 강제한다.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOTS = ["packages/core", "packages/shared"];

// core/·shared/ 에서 금지하는 패턴. 런타임(Workers/Node) 전용이거나 어댑터 의존이면 위반.
const FORBIDDEN = [
  { re: /from\s+["']hono/, msg: "hono import (런타임 프레임워크는 adapters에만)" },
  { re: /from\s+["']@sidetab\/providers/, msg: "providers import (어댑터 의존)" },
  { re: /from\s+["'][^"']*adapters/, msg: "adapters import (core/shared는 어댑터 의존 금지)" },
  { re: /caches\s*\.\s*default/, msg: "caches.default (Workers 전용)" },
  { re: /ctx\s*\.\s*waitUntil/, msg: "ctx.waitUntil (Workers 전용)" },
  { re: /\bKVNamespace\b/, msg: "KVNamespace (Workers 전용)" },
  { re: /\bDurableObject/, msg: "DurableObject (Workers 전용)" },
  { re: /process\s*\.\s*env/, msg: "process.env (Node 전용; EnvConfig 주입을 쓴다)" },
  { re: /\b__dirname\b/, msg: "__dirname (Node 전용)" },
  { re: /\brequire\s*\(/, msg: "require() (CJS/Node 전용)" },
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
    else if (name.endsWith(".ts")) files.push(p);
  }
  return files;
}

const violations = [];
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

if (violations.length) {
  console.error("이식성 가드 실패 — core/·shared/ 에 런타임 전용 코드가 있습니다:");
  for (const v of violations) console.error("  " + v);
  console.error(`\n총 ${violations.length}건. AWS 이식 경계 위반(인터페이스계약 §0-1).`);
  process.exit(1);
}
console.log("이식성 가드 통과: core/·shared/ 런타임 누수 0건.");
