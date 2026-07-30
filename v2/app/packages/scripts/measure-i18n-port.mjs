// v1 -> v2 UI 문구 이식 대상을 근거 등급별로 가른다.
//
// 왜 스크립트인가: 이 분류가 이식 작업 전량을 결정하는데, 손으로 센 값이 하루 동안 틀린 채였다
// (스펙 6-1의 합계가 실제 키 수와 맞지 않았다). 숫자를 기록할 때 그 숫자를 다시 만드는 명령이
// 함께 있어야 다음 세션이 5초에 확인한다.
//
// 왜 게이트가 아닌가: 통과·실패를 판정하지 않는다. 측정만 하고 판단은 사람이 한다.
// gate 체인에 넣지 않는다 — 이식이 끝나면 ①③이 0으로 수렴하는 것이 정상이고, 그때 실패를
//내면 게이트가 거짓말을 한다.
//
//   node packages/scripts/measure-i18n-port.mjs
//
// 값을 읽는 방식: 줄 단위로 읽고 따옴표를 직접 스캔한다. 정규식으로 값을 잡으면 뒤따르는
// // 주석이 값에 섞여 들어간다(실측: terms_why가 그렇게 신규로 오분류됐다).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../../..");
const V2 = resolve(REPO, "v2/app/packages/ui-shared/src/i18n/strings.ts");
const V1 = resolve(REPO, "v1/sidetab/packages/extension/sidepanel/i18n.ts");

// startMarker 뒤부터 endMarker 앞까지에서 `  key: "value"` 쌍을 뽑는다.
function parseBlock(text, startMarker, endMarker) {
  const from = text.indexOf(startMarker);
  if (from < 0) throw new Error(`블록 시작을 못 찾았다: ${startMarker}`);
  const begin = from + startMarker.length;
  const to = text.indexOf(endMarker, begin);
  if (to < 0) throw new Error(`블록 끝을 못 찾았다: ${endMarker}`);

  const out = new Map();
  for (const line of text.slice(begin, to).split("\n")) {
    const m = /^ {2}([A-Za-z_][A-Za-z_0-9]*)\s*:\s*"/.exec(line);
    if (!m) continue;
    let i = line.indexOf('"', m[0].length - 1) + 1;
    let val = "";
    while (i < line.length) {
      const c = line[i];
      if (c === "\\" && i + 1 < line.length) {
        val += line.slice(i, i + 2);
        i += 2;
        continue;
      }
      if (c === '"') break;
      val += c;
      i += 1;
    }
    out.set(m[1], val);
  }
  return out;
}

// 갈래 판정을 한 곳에 둔다. 이식 생성기(port-i18n.mjs)가 이 함수를 가져다 쓰므로,
// 판정 규칙이 두 벌이 되지 않는다 — 두 벌이면 측정과 생성이 다른 갈래를 보게 된다.
export function analyze() {
  const v2 = parseBlock(readFileSync(V2, "utf8"), "export const ko = {", "} as const;");
  const v1src = readFileSync(V1, "utf8");
  const v1 = parseBlock(v1src, "const ko", "};");
  const v1loc = {};
  for (const loc of ["en", "ja", "zh"]) v1loc[loc] = parseBlock(v1src, `const ${loc}`, "};");

  // v1 값 -> 그 값을 가진 v1 키들. 개명 판정에 쓴다.
  const v1ByText = new Map();
  for (const [k, v] of v1) {
    if (!v1ByText.has(v)) v1ByText.set(v, []);
    v1ByText.get(v).push(k);
  }

  const bucket = { A: [], B: [], C: [], D: [] };
  for (const key of [...v2.keys()].sort()) {
    const text = v2.get(key);
    if (v1.has(key)) {
      (v1.get(key) === text ? bucket.A : bucket.B).push(key);
    } else if (v1ByText.has(text)) {
      bucket.C.push([key, v1ByText.get(text)]);
    } else {
      bucket.D.push(key);
    }
  }
  return { v2, v1, v1loc, bucket };
}

// 리포트는 직접 실행할 때만 낸다. 가드가 없으면 analyze를 import하는 쪽이 이 출력을 같이 받는다.
if (resolve(process.argv[1] ?? "") !== resolve(fileURLToPath(import.meta.url))) {
  // 모듈로 불린 경우. analyze만 내보내고 끝낸다.
} else {
  report();
}

function report() {
const { v2, v1, v1loc, bucket } = analyze();

const L = [];
const say = (s) => L.push(s);

say("v1 -> v2 UI 문구 이식 실측");
say("");
say(`v2 키 ${v2.size} / v1 ko 키 ${v1.size} / v1 로케일 키 ` +
  ["en", "ja", "zh"].map((l) => `${l}=${v1loc[l].size}`).join(" "));
say("");
say(`A 이름·문구 모두 일치  (v1 번역 그대로 이식)      ${bucket.A.length}`);
say(`B 이름 같고 문구 다름  (v2 정본, 번역 새로 필요)  ${bucket.B.length}`);
say(`C 개명됐고 문구 일치   (v1 옛 이름으로 이식)      ${bucket.C.length}`);
say(`D v1에 대응 없음       (번역 새로 필요)           ${bucket.D.length}`);
say("");

// ---- 교차 검증. 분할의 합이 총수와 같은 것은 항등식이므로 증거가 아니다.
// 이름 집합의 교집합을 따로 세어, 문구 비교로 갈린 A+B와 맞는지 본다. 두 계산은 어긋날 수 있다.
const nameOverlap = [...v2.keys()].filter((k) => v1.has(k)).length;
const nameOnlyV2 = v2.size - nameOverlap;
const checks = [
  [`이름 교집합 ${nameOverlap} == A+B ${bucket.A.length + bucket.B.length}`,
    nameOverlap === bucket.A.length + bucket.B.length],
  [`v2 전용 이름 ${nameOnlyV2} == C+D ${bucket.C.length + bucket.D.length}`,
    nameOnlyV2 === bucket.C.length + bucket.D.length],
  [`v1 로케일 3종 키 수가 v1 ko와 같다`,
    ["en", "ja", "zh"].every((l) => v1loc[l].size === v1.size)],
  [`A는 전부 v1 3개 언어를 갖는다`,
    bucket.A.every((k) => ["en", "ja", "zh"].every((l) => v1loc[l].has(k)))],
  [`C의 옛 이름은 전부 v1 3개 언어를 갖는다`,
    bucket.C.every(([, olds]) => ["en", "ja", "zh"].every((l) => v1loc[l].has(olds[0])))],
];
say("교차 검증 (어긋날 수 있는 계산끼리 맞춘다)");
let bad = 0;
for (const [label, ok] of checks) {
  say(`  ${ok ? "OK  " : "FAIL"} ${label}`);
  if (!ok) bad += 1;
}
say("");

// ---- 이 스크립트가 원리적으로 못 잡는 것. 적어 두지 않으면 D가 확정값으로 읽힌다.
say("이 측정이 못 잡는 것");
say("  · 이름도 바뀌고 한국어도 손댄 키는 값이 안 맞아 D로 떨어진다.");
say("    v1에 번역이 있는데도 '신규'가 되므로 D는 상한이 아니다.");
const dupText = bucket.C.filter(([, olds]) => olds.length > 1);
say(`  · 같은 한국어를 가진 v1 키가 둘 이상이면 개명 매핑이 임의로 정해진다. 해당 ${dupText.length}건.`);
for (const [k, olds] of dupText) say(`      ${k} <- ${olds.join(" | ")}  (첫 번째를 골랐다)`);
say("");

say("=== C 개명 매핑 전량 (키 이름으로 대조하면 D로 오분류되는 것) ===");
for (const [k, olds] of bucket.C) say(`  ${k}  <-  ${olds[0]}`);
say("");
say("=== B 전량 (v2 정본. v1 en/ja/zh는 다른 한국어의 번역이므로 그대로 쓰면 안 된다) ===");
for (const k of bucket.B) {
  say(`  ${k}`);
  say(`      v2: ${v2.get(k)}`);
  say(`      v1: ${v1.get(k)}`);
}
say("");
say("=== D 전량 (번역을 새로 써야 하는 키) ===");
for (const k of bucket.D) say(`  ${k}  ${v2.get(k)}`);

console.log(L.join("\n"));
if (bad > 0) {
  console.error(`\n교차 검증 ${bad}건 실패 — 숫자를 쓰기 전에 스크립트를 먼저 의심할 것.`);
  process.exit(1);
}
}
