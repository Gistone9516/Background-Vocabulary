// v1 원문과 스펙 초안표에서 en/ja/zh 문구 표를 만든다. 일회성 이식 도구이며 게이트가 아니다.
//
// 왜 생성인가: 103키 × 3언어 = 309문장을 손으로 옮기면 전사 오류가 난다. 그리고 어느 문장이
// v1 이식분(사람 번역)이고 어느 것이 AI 작성분인지가 손으로 옮기는 순간 사라진다(S-37).
//
// 갈래 판정은 measure-i18n-port.mjs의 analyze()를 그대로 쓴다. 판정 규칙을 두 벌 두면
// 측정과 생성이 다른 갈래를 보게 된다.
//
//   node packages/scripts/port-i18n.mjs          빈 칸만 보고한다(파일을 쓰지 않는다)
//   node packages/scripts/port-i18n.mjs --write  파일을 쓴다
//
// 출력: packages/ui-shared/src/i18n/strings.{en,ja,zh}.ts
// ko는 건드리지 않는다 — strings.ts의 주석에 판단이 들어 있고, 재생성하면 그것이 사라진다.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { analyze } from "./measure-i18n-port.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../../../..");
const SPEC = resolve(REPO, "v2/docs/specs/C3-S5-세션과프로젝트.md");
const OUT_DIR = resolve(REPO, "v2/app/packages/ui-shared/src/i18n");
const LOCALES = ["en", "ja", "zh"];

// 소비처 0으로 확인된 키. 표에 넣지 않는다(스펙 §4).
const DEAD = new Set(["handoff_title", "handoff_next"]);

// B갈래와 신규 키의 문구. v1 번역은 옛 한국어의 것이라 출발점으로만 쓴다 — 여기 있는 것은
// v2 한국어에 맞춰 고친 결과이고, 전부 AI 작성분이다(S-37).
const AUTHORED = {
  // 워드마크. 언어와 무관하게 같다. ko가 대문자로 바뀐 것을 따른다
  brand_sub: { en: "VOCK NOTE", ja: "VOCK NOTE", zh: "VOCK NOTE" },
  // v1은 화살표를 문구에 넣었고 v2는 뺐다
  next: { en: "Next", ja: "次へ", zh: "下一步" },
  // [C4 S3 신규] 오프라인 폴백 고지(DS3-1). v1에 없던 문구라 전량 AI 작성.
  offline_notice: {
    en: "You're offline — showing the last saved list.",
    ja: "オフラインです — 最後に保存された一覧を表示しています。",
    zh: "当前处于离线状态 — 显示最后保存的列表。",
  },

  // v1 "이 프로젝트 삭제" -> v2 "프로젝트 삭제". 지시대명사를 뺐다
  project_delete: { en: "Delete project", ja: "プロジェクトを削除", zh: "删除项目" },
  // v1은 라벨, v2는 추가 버튼을 겸한 자리표시자
  project_new_ph: { en: "＋ New project name", ja: "＋ 新しいプロジェクト名", zh: "＋ 新项目名称" },
  // v1 "아직 프로젝트가 없어요" -> v2 "아직 만든 프로젝트가 없어요."
  projects_empty: {
    en: "You haven't created any projects yet.",
    ja: "まだ作成したプロジェクトがありません。",
    zh: "你还没有创建项目。",
  },
  // v1 "아직 탐색 기록이 없어요" -> v2 "아직 이어갈 탐색이 없어요." 기록 없음이 아니라 이어갈 것이 없음
  sessions_empty: {
    en: "No exploration to continue yet.",
    ja: "まだ続けられる探索がありません。",
    zh: "还没有可以继续的探索。",
  },
  // v1 "세션 검색" -> v2 "탐색 검색". 용어가 세션에서 탐색으로 바뀌었다
  sessions_search_ph: { en: "Search explorations", ja: "探索を検索", zh: "搜索探索" },
  // v1 "가져오는 중" -> v2 "고르는 중". 서버가 고르는 것을 드러낸다
  terms_loading: { en: "Picking terms…", ja: "用語を選んでいます…", zh: "正在挑选术语…" },
  // v1은 줄바꿈을 문구에 넣었고 v2는 CSS에 맡긴다
  thinking: {
    en: "AI is reading your answers and choosing the next question…",
    ja: "AIが回答を読んで次の質問を選んでいます…",
    zh: "AI 正在阅读你的回答并挑选下一个问题…",
  },
  // S-34로 신설. v1 relate_skip("이 작업과는 관련 없어요")과 다르다 — v2는 질문이 프로젝트 기준이다
  relate_none: { en: "Not related", ja: "関係ありません", zh: "没有关联" },

  // 붙여넣을 본문의 라벨(S-31). v1은 산문 템플릿(sum_*)이라 대응 원문이 없다.
  // 메인 AI가 읽을 글의 항목 이름이므로 화면 카피보다 간결하고 중립적으로 쓴다.
  primer_ask: {
    en: "Assume I already know the terms below when you answer.",
    ja: "以下の用語はすでに知っているものとして答えてください。",
    zh: "回答时请假设我已经了解下面的术语。",
  },
  primer_task: { en: "What I'm doing", ja: "やりたいこと", zh: "我想做的事" },
  primer_area: { en: "Field", ja: "分野", zh: "领域" },
  primer_condition: { en: "Constraints", ja: "条件", zh: "条件" },
  primer_context: { en: "Context", ja: "参考の文脈", zh: "参考背景" },
  primer_known: { en: "Terms I already know", ja: "すでに知っている用語", zh: "我已经知道的词汇" },

  // 서버 오류 문구(S-35). 한국어는 서버가 쓰던 문구와 같게 맞췄으므로 여기 3개 언어만 새로 쓴다.
  err_pro_only: { en: "This is a pro feature.", ja: "pro 限定の機能です。", zh: "这是 pro 专属功能。" },
  err_detail_limit: {
    en: "You've used up your free detail views.",
    ja: "無料の詳細閲覧を使い切りました。",
    zh: "免费详情查看次数已用完。",
  },
  err_rate_limited: { en: "Please try again in a moment.", ja: "しばらくしてからお試しください。", zh: "请稍后再试。" },
  err_auth_failed: {
    en: "Sign-in failed. Please try again.",
    ja: "ログインに失敗しました。もう一度お試しください。",
    zh: "登录失败，请重试。",
  },
  err_session_expired: {
    en: "Your session expired. Please sign in again.",
    ja: "セッションが期限切れです。もう一度ログインしてください。",
    zh: "会话已过期，请重新登录。",
  },
  err_auth_required: { en: "Sign-in required.", ja: "ログインが必要です。", zh: "需要登录。" },
  err_not_found: { en: "Not found.", ja: "見つかりません。", zh: "未找到。" },
  err_ownership: {
    en: "This record belongs to another account, so it can't be saved.",
    ja: "他のアカウントの記録のため保存できません。",
    zh: "这是其他账户的记录，无法保存。",
  },
  err_malformed: { en: "Couldn't read the response.", ja: "応答を解釈できませんでした。", zh: "无法解析响应。" },
  err_server: { en: "Couldn't complete the request.", ja: "リクエストを処理できませんでした。", zh: "无法处理请求。" },
};

// 로케일 단위 덮어쓰기. v1 번역을 대체로 쓸 수 있는데 **특정 언어만** 자리에 안 맞는 경우다.
// 여기 적힌 로케일만 AI 작성분으로 표시된다 — 한 언어를 고쳤다고 나머지를 AI로 적으면 거짓이 된다.
const OVERRIDE = {
  // 개명 출처 terms_domain_saved는 v1 어휘 화면의 상태 라벨이었다("이 분야를 전에 저장했다").
  // v2에서는 사이드바 제목이라 en "saved exploration"이 자리에 안 맞고 대문자 규칙도 어긋난다
  // (옆의 "Projects"와 짝이 맞지 않는다). 실측 2026-07-30, 브라우저에서 눈으로 확인했다.
  // ja "過去の探索"·zh "历史探索"는 제목으로도 읽히므로 v1 그대로 둔다.
  nav_sessions: { en: "Previous explorations" },
};

// 스펙 §6-2의 표를 읽는다. 행 형식: | `key` | ko | en | ja | zh |
function readDraftTable() {
  const md = readFileSync(SPEC, "utf8");
  const out = new Map();
  for (const line of md.split("\n")) {
    const m = /^\|\s*`([a-z_0-9]+)`\s*\|(.+)\|\s*$/.exec(line);
    if (!m) continue;
    const cells = m[2].split("|").map((c) => c.trim());
    if (cells.length < 4) continue;
    const [, en, ja, zh] = cells;
    if (!en || !ja || !zh) continue;
    out.set(m[1], { en, ja, zh });
  }
  return out;
}

const { v2, v1loc, bucket } = analyze();
const drafts = readDraftTable();

const renamed = new Map(bucket.C.map(([k, olds]) => [k, olds[0]]));
// 출처는 로케일 단위로 기록한다. 한 언어만 덮어쓸 때 나머지를 AI로 표시하면 거짓이 된다.
const origin = new Map(); // key -> { en: "v1"|"authored"|"draft", ja: ..., zh: ... }
const table = { en: new Map(), ja: new Map(), zh: new Map() };
const missing = [];

for (const key of [...v2.keys()].sort()) {
  if (DEAD.has(key)) continue;

  let got = null;
  let from = null;

  if (bucket.A.includes(key)) {
    got = Object.fromEntries(LOCALES.map((l) => [l, v1loc[l].get(key)]));
    from = "v1";
  } else if (renamed.has(key)) {
    const old = renamed.get(key);
    got = Object.fromEntries(LOCALES.map((l) => [l, v1loc[l].get(old)]));
    from = "v1";
  } else if (AUTHORED[key]) {
    got = AUTHORED[key];
    from = "authored";
  } else if (drafts.has(key)) {
    got = drafts.get(key);
    from = "draft";
  }

  const per = Object.fromEntries(LOCALES.map((l) => [l, from]));
  if (OVERRIDE[key]) {
    for (const l of LOCALES) {
      if (OVERRIDE[key][l] === undefined) continue;
      got = { ...(got ?? {}), [l]: OVERRIDE[key][l] };
      per[l] = "authored";
    }
  }

  if (!got || LOCALES.some((l) => !got[l])) {
    missing.push(key);
    continue;
  }
  for (const l of LOCALES) table[l].set(key, got[l]);
  origin.set(key, per);
}

// v2에 실제로 남아 있는 비-죽은 키를 센다. `v2.size - DEAD.size`로 쓰면 죽은 키를 이미 지운
// 뒤에는 이중 차감이 된다 — 실측 2026-07-30, 지운 직후 이 단언이 걸려서 잡았다.
const expected = [...v2.keys()].filter((k) => !DEAD.has(k)).length;
// 문장 단위로 센다. 키 단위로 세면 로케일 하나만 AI인 키가 전부 AI로 보인다.
const cells = { v1: 0, authored: 0, draft: 0 };
for (const per of origin.values()) for (const l of LOCALES) cells[per[l]] += 1;
// S-37 집계 = AI 문장이 하나라도 있는 키. 보수적으로 잡는다 — 먼저 의심할 대상을 놓치지 않는다.
const aiKeys = [...origin.entries()]
  .filter(([, per]) => LOCALES.some((l) => per[l] !== "v1"))
  .map(([k]) => k)
  .sort();

const deadStillPresent = [...DEAD].filter((k) => v2.has(k)).length;
console.log(
  `대상 키 ${expected} (v2 ${v2.size}, 그중 삭제 대상 ${deadStillPresent}건이 아직 남아 있음)`
);
console.log(`  문장 ${cells.v1 + cells.authored + cells.draft}건 = v1 이식 ${cells.v1} / AI 작성 ${cells.authored + cells.draft}`);
console.log(`  AI 문장이 하나라도 있는 키 ${aiKeys.length}건 (S-37 집계 대상)`);
console.log(`  채운 키 합계   ${origin.size}`);

if (missing.length) {
  console.error(`\n문구를 못 찾은 키 ${missing.length}건 — AUTHORED에 넣거나 스펙 초안표에 행을 추가할 것:`);
  for (const k of missing) console.error(`  ${k}  ${v2.get(k)}`);
  process.exit(1);
}
if (origin.size !== expected) {
  console.error(`\n채운 키 ${origin.size} != 대상 ${expected}. 스크립트를 의심할 것.`);
  process.exit(1);
}

if (!process.argv.includes("--write")) {
  console.log("\n빈 칸 없음. --write 를 주면 파일을 쓴다.");
  process.exit(0);
}

function emit(loc) {
  const head = [
    `// ${loc} UI 문구. packages/scripts/port-i18n.mjs 가 생성한다 — 손으로 고쳐도 되지만,`,
    `// 다시 생성하면 덮인다. 문구를 바꾸려면 그 스크립트의 AUTHORED 또는 스펙 §6-2를 고칠 것.`,
    `//`,
    `// [v1] = v1 i18n.ts에서 그대로 옮긴 사람 번역. [AI] = AI가 쓴 문장(S-37).`,
    `// 두 등급이 섞여 있고 그 사실이 지워지지 않아야 한다 — AI_AUTHORED 목록이 그것을 센다.`,
    ``,
    `import type { StringKey } from "./strings.js";`,
    ``,
    `export const ${loc}: Record<StringKey, string> = {`,
  ];
  const body = [...table[loc].entries()].map(([k, v]) => {
    const tag = origin.get(k)[loc] === "v1" ? "[v1]" : "[AI]";
    return `  ${k}: ${JSON.stringify(v)}, // ${tag}`;
  });
  return [...head, ...body, "};", ""].join("\n");
}

for (const loc of LOCALES) {
  const path = resolve(OUT_DIR, `strings.${loc}.ts`);
  writeFileSync(path, emit(loc), "utf8");
  console.log(`  wrote ${path}`);
}

const listSrc = [
  `// AI가 쓴 문구의 키 목록(S-37). v1 이식분과 근거 등급이 다르다는 사실을 코드에 남긴다.`,
  `// 사용자가 일본어·중국어를 검증할 수 없으므로 이 목록은 줄지 않을 수 있다. 그래도 세는 것이`,
  `// 안 세는 것보다 낫다 — 나중에 어느 문장을 먼저 의심해야 하는지가 이 목록에만 있다.`,
  `// port-i18n.mjs 가 생성한다.`,
  ``,
  `import type { StringKey } from "./strings.js";`,
  ``,
  `export const AI_AUTHORED: readonly StringKey[] = [`,
  ...aiKeys.map((k) => `  "${k}",`),
  `];`,
  ``,
].join("\n");
writeFileSync(resolve(OUT_DIR, "strings.origin.ts"), listSrc, "utf8");
console.log(`  wrote strings.origin.ts (AI 작성분 ${aiKeys.length}건)`);
