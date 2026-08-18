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
    file: "packages/ui-shared/src/app/journey.tsx",
    maxLines: 320,
    // C5-S3에서 두 책임을 더 갈라낸 뒤의 값이다. 진입 화면 슬롯에 무엇을 넣을지는
    // app/entry-slot.tsx, 저장된 기록을 화면 상태로 펴는 일은 app/resume-into.ts로 나갔다.
    // 앞서 journey-state.ts(타입)와 shell-bridge.ts(능력 배선)가 같은 이유로 갈라졌다.
    reason:
      "여정 배선 한 벌. D-12가 웹과 데스크톱의 여정을 한 곳에 두라고 요구하므로 화면 수(7)만큼 커지는 것이 구조적이고, 화면별로 쪼개면 '지금 어느 화면인가'를 한 곳에서 답할 수 없게 된다. 갈라낼 수 있는 것(상태 타입·능력 배선·진입 슬롯·재개 배선)은 이미 네 번 갈라냈다.",
  },
  {
    file: "packages/ui-shared/src/api/http-client.ts",
    maxLines: 360,
    reason:
      "ApiPort·AuthPort의 fetch 구현 하나. 엔드포인트별로 쪼개면 401 재발급·형태 검사·취소 전파 같은 전송 규칙이 파일마다 복제되고, '클라가 계약을 다 구현했나'를 한 곳에서 답할 수 없게 된다.",
  },
  {
    file: "packages/ui-shared/src/styles/tokens.css",
    maxLines: 700,
    // 2026-07-30에 `:root` 변수만 vars.css로 갈라냈다. 그래서 이 사유 문구를 고쳤다 — 예전 문구는
    // "색과 타이포와 컴포넌트 클래스가 서로를 참조하므로 쪼개면 관계가 흩어진다"였고, 실제로 한 번
    // 쪼갠 지금은 그 문장이 사실과 어긋난다. 갈라낸 기준은 "관계"가 아니라 **밖으로 내보낼 수 있는
    // 최소 단위**였다: 랜딩은 변수만 필요하고 컴포넌트 클래스를 받으면 레이아웃이 망가진다.
    reason:
      "v1 theme.css에서 계승한 컴포넌트 스타일 한 벌. 변수는 vars.css로 갈라냈고(밖으로 내보낼 최소 단위) 남은 것은 서로를 참조하는 요소·컴포넌트 규칙이라 더 쪼개면 관계가 흩어진다. 책임은 하나다.",
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
    else if (/\.(ts|tsx|css|astro)$/.test(name)) files.push(p);  // .astro 포함(L-8)
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
