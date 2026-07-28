// 파일 크기 게이트(코드규약 §1). 기준은 줄 수가 아니라 단일 책임이다.
// 크기는 신호일 뿐이므로 상한을 넘는 것 자체는 잘못이 아니다. 다만 사유를 적어 ALLOWLIST에 등록해야 한다.
// 즉 이 게이트가 잡는 것은 "초과"가 아니라 "설명되지 않은 초과"다. 예외를 없애는 것이 아니라 보이게 하는 것이 목적이다.
// 200행 초과는 분리 검토 경고(실패 아님).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HARD_CAP = 300;
const REVIEW = 200;
const SCAN_ROOT = join(APP_ROOT, "packages");

// 상한 초과를 허용하는 예외. { file: 상대경로, maxLines, reason }.
// 등록 조건은 "이 파일이 책임 하나인가"에 예라고 답할 수 있는 경우뿐이다.
const ALLOWLIST = [
  {
    file: "packages/ui-shared/src/styles/tokens.css",
    maxLines: 700,
    reason: "v1 theme.css에서 계승한 디자인 시스템 정본 한 벌. 색과 타이포와 컴포넌트 클래스가 서로를 참조하므로 쪼개면 관계가 흩어진다. 책임은 하나다.",
  },
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
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) files = files.concat(walk(p));
    else if (name.endsWith(".ts") || name.endsWith(".tsx") || name.endsWith(".css")) files.push(p);
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
    violations.push(
      allow
        ? `${rel}  ${lines}행 > 등록된 상한 ${cap} — ALLOWLIST의 maxLines를 다시 판단할 것`
        : `${rel}  ${lines}행 > ${cap} — 책임이 하나면 ALLOWLIST에 사유와 함께 등록하고, 아니면 분리할 것`
    );
  } else if (lines > REVIEW && !allow) {
    warnings.push(`${rel}  ${lines}행 (분리 검토 권고, >${REVIEW})`);
  }
}

if (warnings.length) {
  console.log("파일 크기 경고(실패 아님):");
  for (const w of warnings) console.log("  " + w);
}
if (violations.length) {
  console.error("파일 크기 게이트 실패 — 설명되지 않은 초과(코드규약 §1):");
  for (const v of violations) console.error("  " + v);
  process.exit(1);
}
console.log(`파일 크기 게이트 통과: 설명되지 않은 초과 0건(등록 예외 ${ALLOWLIST.length}건).`);
