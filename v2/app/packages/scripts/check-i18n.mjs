// 로케일별 문구 표 게이트(S-19·S-37).
//
// 키 집합 일치는 검사하지 않는다 — `Record<StringKey, string>` 타이핑이 tsc에서 이미 막는다.
// 검사를 두 벌 두면 어느 쪽이 정본인지 모르게 되고, 타입이 막는 것을 스크립트가 다시 막으면
// 타입을 느슨하게 바꿔도 게이트가 통과해 버린다.
//
// 여기서 보는 것은 타입이 원리적으로 못 잡는 것들이다:
//   1. 자리표시자 누락 — ko에 {n}이 있는데 번역에 없으면 숫자가 조용히 사라진다
//   2. 빈 문자열 — 타입은 ""도 string으로 통과시킨다
//   3. ko와 글자까지 같은 값 — 번역을 잊고 복사한 흔적. 워드마크처럼 정당한 경우는 등록한다
// 그리고 AI 작성분 건수를 보고한다(S-37). 실패가 아니라 정보다 — 사용자가 일본어·중국어를
// 검증할 수 없으므로 이 수는 줄지 않을 수 있고, 줄어야 하는 것처럼 실패를 내면 게이트가 거짓말을 한다.
//
//   node packages/scripts/check-i18n.mjs
//
// 빌드 산출물(dist)을 소비하므로 실행 전 `pnpm build`가 선행되어야 한다(gate 체인이 보장한다).
// 빌드를 잊으면 옛 표를 검사해 통과·실패가 둘 다 거짓이 된다 — 실측으로 한 번 겪었다.

import { STRINGS, AI_AUTHORED } from "@vock/ui-shared";
import { OUTPUT_LOCALES } from "@vock/shared";

// ko와 같아도 정당한 키. 사유를 함께 적는다 — 사유 없는 예외는 다음 세션이 지운다.
const SAME_AS_KO_OK = new Map([
  ["brand_sub", "워드마크. 언어와 무관하게 VOCK NOTE다"],
]);

const ph = (s) => (s.match(/\{(\w+)\}/g) ?? []).sort().join(",");

const fail = [];
const warn = [];
const ko = STRINGS.ko;
const keys = Object.keys(ko);

for (const loc of OUTPUT_LOCALES) {
  if (loc === "ko") continue;
  const table = STRINGS[loc];
  for (const k of keys) {
    const v = table[k];
    if (typeof v !== "string" || v.trim() === "") {
      fail.push(`${loc}.${k} 값이 비었다`);
      continue;
    }
    if (ph(v) !== ph(ko[k])) {
      fail.push(`${loc}.${k} 자리표시자 불일치 — ko [${ph(ko[k]) || "없음"}] vs ${loc} [${ph(v) || "없음"}]`);
    }
    if (v === ko[k] && !SAME_AS_KO_OK.has(k)) {
      warn.push(`${loc}.${k} 가 ko와 글자까지 같다 — 번역을 잊었는지 확인할 것`);
    }
  }
}

const aiCount = AI_AUTHORED.length;
const ported = keys.length - aiCount;

if (warn.length) {
  console.log("i18n 경고(실패 아님):");
  for (const w of warn) console.log("  " + w);
}
if (fail.length) {
  console.error("i18n 게이트 실패:");
  for (const f of fail) console.error("  " + f);
  process.exit(1);
}
console.log(
  `i18n 게이트 통과: 키 ${keys.length} × 로케일 ${OUTPUT_LOCALES.length}, ` +
    `자리표시자 불일치 0건, 빈 값 0건. 출처 = v1 이식분 ${ported} / AI 작성분 ${aiCount}(S-37).`
);
