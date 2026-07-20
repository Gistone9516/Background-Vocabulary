// 파일 크기 게이트(코드규약 §1). 소스 파일 = 단일 책임.
// 300행 상한은 사유서(ALLOWLIST) 없이 넘을 수 없다. 200행 초과는 분리 검토 경고(실패 아님).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HARD_CAP = 300;
const REVIEW = 200;
const SCAN_ROOT = join(APP_ROOT, "packages");

// 상한 초과를 허용하는 예외. { file: 상대경로, maxLines, reason }. 지금은 없음.
const ALLOWLIST = [];

function walk(dir) {
  let files = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files = files.concat(walk(p));
    else if (name.endsWith(".ts") || name.endsWith(".tsx")) files.push(p);
  }
  return files;
}

const violations = [];
const warnings = [];

for (const file of walk(SCAN_ROOT)) {
  const rel = relative(APP_ROOT, file).split("\\").join("/");
  // 빈 줄 포함 전체 행수(빈 줄 미집계 함정 회피).
  const lines = readFileSync(file, "utf-8").split("\n").length;
  const allow = ALLOWLIST.find((a) => rel.endsWith(a.file));
  const cap = allow ? allow.maxLines : HARD_CAP;
  if (lines > cap) {
    violations.push(`${rel}  ${lines}행 > 상한 ${cap}${allow ? " (allowlist)" : ""}`);
  } else if (lines > REVIEW && !allow) {
    warnings.push(`${rel}  ${lines}행 (분리 검토 권고, >${REVIEW})`);
  }
}

if (warnings.length) {
  console.log("파일 크기 경고(실패 아님):");
  for (const w of warnings) console.log("  " + w);
}
if (violations.length) {
  console.error("파일 크기 게이트 실패 — 300행 상한 초과(코드규약 §1):");
  for (const v of violations) console.error("  " + v);
  process.exit(1);
}
console.log(`파일 크기 게이트 통과: 300행 초과 0건.`);
