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
  providers: new Set(["shared"]),
  "ui-shared": new Set(["shared"]),
  web: new Set(["shared", "ui-shared"]),
  // 데스크톱 셸(C4 S1). web과 같은 방향이다 — 여정 배선이 ui-shared로 올라갔으므로(DS-2)
  // 셸은 ShellDeps 구현만 갖고, core·http-app을 직접 부를 이유가 없다.
  desktop: new Set(["shared", "ui-shared"]),
  // 랜딩은 독립이다(SoT §7 "landing은 독립(+디자인 토큰만 공유)"). 값이 빈 집합인 것이 규칙이며,
  // 키를 아예 빼면 안 된다 — 키가 없으면 `!allow`로 걸려 "등록 안 된 패키지"와 구분되지 않는다.
  // 디자인 토큰 CSS는 아래 isAssetEntry 예외로 통과한다. 코드는 하나도 못 가져온다(L-2).
  landing: new Set([]),
  "http-app": new Set(["shared", "core"]),
  local: new Set(["shared", "core", "http-app", "persistence", "providers"]),
  aws: new Set(["shared", "core", "http-app", "persistence", "providers"]),
  // 도구(빌드 산출물 소비). 런타임 의존 그래프의 일부가 아니라 검증기이므로 검증 대상을 부를 수 있다.
  // ui-shared는 좁히기 상태 기계를 서버 없이 검증하기 위해 들어왔다(e2e-narrow).
  scripts: new Set(["shared", "core", "http-app", "local", "persistence", "providers", "ui-shared"]),
};

// 정적 자산(CSS 등)만 가져올 수 있는 방향. 코드 의존과 **따로** 선언한다.
// 처음에는 자산이면 방향 검사를 건너뛰게 두려 했으나, 그러면 "누가 누구의 자산을 쓰는지"가
// 아무 데도 적히지 않는다. landing이 ui-shared의 디자인 토큰만 가져온다는 것은 계약이므로
// (SoT §7 "landing은 독립(+디자인 토큰만 공유)") 데이터로 적어 둔다.
//
// 패키지 이름이 아니라 **진입점 경로**로 적는다. 처음에는 `landing: {"ui-shared"}`로 두어
// ui-shared의 어떤 CSS든 통과했는데, 그것이 규칙보다 넓었다 — L-2가 말한 것은 "디자인 토큰 CSS만"
// 이고 `styles.css`는 앱 요소 스타일까지 담은 진입점이다. 실측으로 겪었다: 랜딩이 그걸 가져오자
// `main`이 내부 스크롤 판이 되어 아래 두 절이 화면에서 사라진 것처럼 보였다(렌더는 되어 있었다).
// 화면이 그럴듯하게 망가지므로 사람이 통과로 착각한다. 그래서 파일 하나까지 계약으로 적는다.
//
// 이 검사는 **import 문자열**만 본다 — 그 이름이 실제로 어떤 파일로 해석되는지는 보지 않는다.
// 그래서 진입점 이름과 파일 이름을 같게 두는 것이 이 게이트가 뜻을 갖는 조건이다.
const ASSET_ALLOWED = {
  landing: new Set(["ui-shared/vars.css"]),
  // web은 앱 스타일 진입점 전체를 쓴다(main.tsx, vite.config.ts). 이 항을 빠뜨렸더니 이미
  // 통과하던 web이 실패했다 — 새 검사를 넣을 때 기존 통과 경로를 함께 시험해야 한다는 실측이다.
  web: new Set(["ui-shared/styles.css"]),
  // 데스크톱도 같은 앱이므로 같은 진입점(C4 S1). landing과 달리 변수만이 아니라 전체를 받는다.
  desktop: new Set(["ui-shared/styles.css"]),
};

function walk(dir) {
  let out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    // .astro도 본다(L-8). 넣지 않으면 랜딩이 무검사 구역이 되고, "게이트로 강제한다"가 거짓이 된다.
    else if (/\.(ts|tsx|mjs|astro)$/.test(name)) out.push(p);
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
      // 배럴 규칙은 내부 모듈 구조 침범을 막으려는 것이다. 패키지 exports에 선언된
      // 정적 자산 진입점(스타일 등)은 코드 결합이 아니므로 예외로 둔다.
      const isAssetEntry = /\.(css|svg|png|woff2?)$/.test(rest);
      const deep = rest.includes("/") && !isAssetEntry;
      if (deep) {
        violations.push(`${rel}\n    딥임포트 금지, 배럴 경유로만: ${spec}`);
      }
      // 자산 진입점은 코드 결합이 아니므로 ASSET_ALLOWED로 따로 판정한다. 순환 그래프에도
      // 넣지 않는다 — CSS import는 실행 순서를 만들지 않는다.
      if (isAssetEntry) {
        const assetAllow = ASSET_ALLOWED[pkg];
        // `target`(패키지)이 아니라 `rest`(패키지/진입점 전체)로 판정한다 — 위 주석의 이유.
        if (!assetAllow || !assetAllow.has(rest)) {
          violations.push(`${rel}\n    허용밖 자산 의존: ${pkg} → ${rest} (${spec})`);
        }
        continue;
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
