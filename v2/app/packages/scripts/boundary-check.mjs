// 경계 게이트 3중 중 순환·역참조·딥임포트 검사(SoT §0-1·§7).
// dependency-cruiser 대체: 한글+공백 경로에서 Node의 #subpath-imports 해석이 깨져(그 도구가
// 자기 소스에서 #utl/*를 씀) 이 프로젝트 경로에선 실행 불가하다. 계약(순환·역참조·배럴 경유)은
// 의존성 없는 이 스크립트로 동일하게 강제한다. 실행 CWD와 무관(스크립트 위치 기준).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve, relative } from "node:path";

const APP_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SCAN = join(APP_ROOT, "packages");

// 허용 의존 방향(SoT §7). 키·값은 @vock 패키지 이름. 새 패키지는 여기 등록한다.
const ALLOWED = {
  shared: new Set([]),
  core: new Set(["shared"]),
  persistence: new Set(["shared"]),
  "http-app": new Set(["shared", "core"]),
  local: new Set(["shared", "core", "http-app", "persistence"]),
  scripts: new Set(["shared", "core", "http-app", "local", "persistence"]), // 도구(빌드 산출물 소비)
};

function walk(dir) {
  let out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (name.endsWith(".ts") || name.endsWith(".tsx") || name.endsWith(".mjs")) out.push(p);
  }
  return out;
}

// 경로에서 소속 @vock 패키지 이름을 뽑는다. adapters/<name> 우선.
function pkgOfPath(file) {
  const n = file.split("\\").join("/");
  let m = n.match(/packages\/adapters\/([^/]+)\//);
  if (m) return m[1];
  m = n.match(/packages\/([^/]+)\//);
  return m ? m[1] : null;
}

// 파일에서 import/export 모듈 스펙파이어를 뽑는다(주석 제거 후).
function specifiersOf(src) {
  const noComment = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const specs = [];
  for (const m of noComment.matchAll(/\bfrom\s*["']([^"']+)["']/g)) specs.push(m[1]);
  for (const m of noComment.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g)) specs.push(m[1]);
  for (const m of noComment.matchAll(/(?:^|\n)\s*import\s+["']([^"']+)["']/g)) specs.push(m[1]);
  return specs;
}

const violations = [];
const graph = {}; // pkg -> Set(@vock dep pkgs)

for (const file of walk(SCAN)) {
  const pkg = pkgOfPath(file);
  if (!pkg) continue;
  graph[pkg] ??= new Set();
  const rel = relative(APP_ROOT, file).split("\\").join("/");
  for (const spec of specifiersOf(readFileSync(file, "utf-8"))) {
    if (spec.startsWith("@vock/")) {
      const rest = spec.slice("@vock/".length);
      const target = rest.split("/")[0];
      const deep = rest.includes("/");
      if (deep) {
        violations.push(`${rel}\n    딥임포트 금지 — 배럴 경유로만: ${spec}`);
      }
      graph[pkg].add(target);
      const allow = ALLOWED[pkg];
      if (!allow || !allow.has(target)) {
        violations.push(`${rel}\n    역참조/허용밖 의존: ${pkg} → ${target} (${spec})`);
      }
    } else if (spec.startsWith(".")) {
      // 상대경로가 자기 패키지 밖으로 나가면 경로 우회 크로스임포트.
      const resolved = resolve(dirname(file), spec);
      const targetPkg = pkgOfPath(resolved.split("\\").join("/") + "/");
      if (targetPkg && targetPkg !== pkg) {
        violations.push(`${rel}\n    경로 우회 크로스임포트(상대경로가 패키지 밖으로): ${spec}`);
      }
    }
  }
}

// 패키지 그래프 순환 검사(DFS 백엣지).
const cycleFound = [];
const state = {}; // 0=미방문,1=방문중,2=완료
function dfs(node, stack) {
  state[node] = 1;
  stack.push(node);
  for (const dep of graph[node] ?? []) {
    if (state[dep] === 1) {
      const i = stack.indexOf(dep);
      cycleFound.push(stack.slice(i).concat(dep).join(" → "));
    } else if (!state[dep]) {
      dfs(dep, stack);
    }
  }
  stack.pop();
  state[node] = 2;
}
for (const node of Object.keys(graph)) if (!state[node]) dfs(node, []);
for (const c of cycleFound) violations.push(`순환 의존: ${c}`);

if (violations.length) {
  console.error("경계 게이트 실패 — 의존 방향/순환/배럴 위반(SoT §0-1·§7):");
  for (const v of violations) console.error("  " + v);
  console.error(`\n총 ${violations.length}건.`);
  process.exit(1);
}
console.log("경계 게이트 통과: 역참조 0건, 순환 0건, 딥임포트 0건.");
