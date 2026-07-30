// UI 문구. v1 i18n.ts의 한국어 원문을 그대로 옮긴다(카피는 임의로 바꾸지 않는다).
// 표시는 [v1] 원문 그대로, [신규] v2에서 새로 쓴 문구.
//
// ko는 손으로 관리한다 — 아래 주석에 판단이 들어 있고, 생성으로 덮으면 그것이 사라진다.
// en/ja/zh는 strings.{en,ja,zh}.ts 에 있고 port-i18n.mjs 가 생성한다. 그 파일들은 어느 문장이
// v1 이식분이고 어느 것이 AI 작성분인지 [v1]/[AI]로 표시하며, 목록은 strings.origin.ts 가 센다.
//
// 키를 추가하면 세 파일이 전부 비어 tsc가 실패한다. 그것이 의도다(S-19) — 새 키가 한국어만
// 채워진 채로 배포되는 경로를 타입이 막는다.

import type { OutputLocale } from "@vock/shared";
import { en } from "./strings.en.js";
import { ja } from "./strings.ja.js";
import { zh } from "./strings.zh.js";

export const ko = {
  brand: "배경노트",
  brand_sub: "VOCK NOTE",
  entry_title: "무슨 일 때문에 왔나요?",
  entry_sub: "그 분야 핵심 어휘를 옆에 사전처럼 띄워둘게요. 막힌 용어를 적어도 돼요.",
  entry_input_ph: "무엇을 하려는지 한 줄로 적어주세요",
  entry_input_aria: "무슨 일 때문에 왔는지 상황 입력",
  cond_add: "+ 조건",
  cond_close: "– 조건 접기",
  cond_ph: "좁혀줄 조건 · 분야, 도구, 마감 등",
  cond_aria: "좁혀줄 조건",
  entry_err: "상황을 한 줄 적거나 아래에서 골라주세요.",
  next: "다음",
  shuffle: "다른 예시",
  menu: "메뉴",
  lang_label: "언어", // [v1 원문: lang_label]
  nav_sessions: "이전 탐색",
  nav_projects: "프로젝트",
  sessions_empty: "아직 이어갈 탐색이 없어요.",
  projects_empty: "아직 만든 프로젝트가 없어요.",

  // 좁히기 [v1 원문]
  narrow_ai: "AI가 좁히는 중 · {n}번째",
  narrow_almost: " · 거의 다 좁혔어요",
  narrow_lead: "해당하는 걸 모두 고르세요 · 여러 개 가능",
  narrow_hard: "선택지 내용이 어려워요",
  narrow_simplified: "쉬운 말로 다시 물어볼게요",
  narrow_jump: "지금 충분해요 · 어휘 보기 →",
  narrow_budget: "남은 좁히기 {n}턴",
  narrow_range_free: "최대 {max}턴 · AI가 충분하면 더 일찍 끝나요",
  narrow_range_pro: "{min}~{max}턴 · AI가 충분하다고 판단하면 자동 종료",
  undo: "↩ 처음 질문으로",
  undo_title: "되돌리기는 한 번만 쓸 수 있어요",
  custom_open: "＋ 직접 입력",
  custom_ph: "원하는 답을 직접 적어주세요",
  custom_hint: "위에서 고른 선택지와 함께 반영돼요",
  thinking: "AI가 답을 읽고 다음 질문을 고르는 중…",

  // [신규] 되돌린 뒤 남을 질문 수를 함께 보여준다(스펙 D-8)
  undo_left: "↩ 처음 질문으로 · 남은 질문 {n}턴",
  // [신규] 종료 사유 고지(스펙 D-9). 사용자가 직접 끊은 경우와 내부 오류는 알리지 않는다
  done_enough: "충분히 좁혀졌어요. 이제 어휘를 정리할게요.",
  done_exhausted: "이번 탐색의 질문을 다 썼어요. 지금까지 고른 내용으로 정리할게요.",
  // [신규] 주간 한도 소진으로 진입 화면에 되돌아온 경우(스펙 B-14). 전체 페이월 화면은 S4
  weekly_exhausted: "이번 주 무료 탐색을 다 썼어요. 이어가던 탐색은 그대로 열 수 있어요.",
  // [신규] 일시적 실패(스펙 D-7)
  retry: "다시 시도",
  err_network: "연결이 잠시 끊겼어요.",

  // 난이도 선택 [v1 원문]
  diff_eyebrow: "거의 다 왔어요",
  diff_title: "어느 깊이로 볼까요?",
  diff_sub: "고른 깊이에 맞춰 어휘를 골라드려요.",
  diff_basic: "기초",
  diff_basic_desc: "그 분야가 처음이에요. 가장 기본 어휘부터.",
  diff_inter: "중급",
  diff_inter_desc: "기본은 넘었어요. 실무자가 쓰는 전문 어휘로.",
  diff_adv: "심화",
  diff_adv_desc: "더 깊이. 전문가도 감탄할 날카로운 어휘까지.",
  diff_ex_label: "예시 어휘",
  // [신규] 프리뷰는 보조 정보라 실패해도 선택은 계속된다
  diff_preview_failed: "예시를 불러오지 못했어요. 깊이는 그대로 고를 수 있어요.",

  // 어휘 목록
  terms_why: "추천 이유", // [v1 원문: why_label]
  // [신규]
  terms_loading: "어휘를 고르는 중…",
  terms_streaming: "계속 채우는 중…",
  terms_capped: "이번 탐색에서 담을 수 있는 만큼 다 채웠어요.",

  // 카드 상세 [v1 원문]
  detail_what: "개념",
  detail_whymine: "내 상황",
  detail_how: "활용",
  detail_sources: "함께 볼 어휘 · 출처",
  detail_loading: "개념을 불러오는 중…",
  detail_nosrc: "확인된 출처 없음 · 일반 지식 기반 설명이에요. 중요한 판단은 메인 AI나 1차 자료로 한 번 더 확인하세요.",
  // [신규] 카드 펼치기 버튼
  detail_open: "자세히 보기",
  detail_close: "접기",

  // 담기와 담은 어휘 [v1 원문]
  keep_on: "담음 ✓",
  keep_off: "＋ 담기",
  kept_count: "담은 어휘 {n}",
  kept_title: "담은 어휘",
  kept_view: "담은 어휘 보기",
  kept_some: "{n}개를 담아뒀어요. 펼쳐 보거나 빼낼 수 있어요.",
  kept_none: "아직 담은 어휘가 없어요. 어휘 화면에서 쓸 만한 카드를 담아보세요.",
  kept_back_terms: "← 어휘로 돌아가기",
  kept_back_home: "← 처음으로",
  paste_head: "메인 AI에 붙여넣기 (선택)",
  paste_sub: "복사해서 ChatGPT·Claude 같은 메인 AI에 붙여넣으면, 이 어휘들을 이미 아는 맥락으로 두고 내 작업을 바로 도와줘요.",
  copy: "복사",
  copy_done: "복사됐어요",
  copy_fail: "복사 실패 · 아래 글을 직접 선택해 복사하세요",
  ai_extra: "AI로 더 정리",
  refine_loading: "AI가 정리하는 중…",
  refine_failed: "정리에 실패했어요.",

  // 세션 목록 [신규]. v1은 확장 로컬 저장이라 로그인 조건이 없었다
  sessions_off: "로그인하면 탐색이 저장돼요.",
  sessions_search_ph: "탐색 검색",
  sessions_more: "더 보기",
  session_untitled: "제목 없는 탐색",
  session_generating: "생성 중",
  session_delete: "삭제",
  session_deleted: "삭제했어요.",
  session_undo_expired: "되돌릴 수 있는 기간이 지났어요.",
  session_undo: "실행취소",
  sessions_loading: "불러오는 중…",

  // 프로젝트 [신규]
  projects_off: "로그인하면 프로젝트로 묶을 수 있어요.",
  project_new_ph: "＋ 새 프로젝트 이름",
  project_delete: "프로젝트 삭제",
  project_delete_hint: "프로젝트만 지우고 탐색은 남겨요",

  // 연결 턴 [v1 후반 승계]
  relate_lead: "이 프로젝트에서 이미 담은 어휘와 이어지나요?",
  // [신규] 탈출구 라벨(S-34). v1 relate_skip("이 작업과는 관련 없어요")과 다르다 — v2는 질문이
  // 프로젝트 기준으로 바뀌어 "이 작업과는"이 맞지 않는다. 따라서 v1 번역도 그대로 쓸 수 없다
  relate_none: "관련 없어요",

  // 거부 화면 [신규]. v1에 대응 문구가 없다. 정본은 서버의 HIGH_RISK_REFUSED 응답 문구이며
  // (gating.ts:61, errors.ts:44) 여기 값은 그것과 한 글자도 달라선 안 된다 — 다르면 정본이 둘이 된다
  refusal_title: "안전상 직접 다루지 않는 주제예요.",
  refusal_home: "처음으로",

  // 로그인 [신규]. v1은 확장이라 로그인 화면이 따로 없었다
  auth_sign_in: "구글로 로그인",
  auth_sign_out: "로그아웃",
  auth_signing_in: "로그인하는 중…",
} as const;

export type StringKey = keyof typeof ko;

// 4개 언어 표. `Record<StringKey, string>`로 타이핑했으므로 **키 누락은 tsc가 막는다**(S-19).
// 폴백 분기가 생길 자리를 타입으로 없앤 것이다 — 런타임 검사로 막으면 검사를 빠뜨린 경로가 남고,
// 그 경로에서 조용히 한국어가 나온다. v1 t()가 `?? STRINGS.ko[key] ?? key`로 정확히 그랬다.
// en/ja/zh는 packages/scripts/port-i18n.mjs 가 v1 원문과 스펙 초안표에서 생성한다.
export const STRINGS: Record<OutputLocale, Record<StringKey, string>> = { ko, en, ja, zh };

// {n} 같은 자리표시자를 채운다. 컴포넌트는 이걸 직접 부르지 않고 useTr()로 로케일을 받는다 —
// 로케일을 인자로 넘겨야 하는 곳은 React 밖의 4곳뿐이다(App.tsx doneNotice, primer.ts 2곳).
export function trIn(locale: OutputLocale, key: StringKey, vars?: Record<string, string | number>): string {
  const raw = STRINGS[locale][key];
  // 없는 키는 예외다(S-36). 타입상 도달 불가이고 캐스트나 동적 키로만 온다.
  // 여기서 빈 문자열이나 ko를 돌려주면 S-19의 타입 강제가 이 구멍 하나로 무의미해진다.
  if (raw === undefined) throw new Error(`문구 키가 없다: ${locale}.${String(key)}`);
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}
