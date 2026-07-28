// UI 문구. v1 i18n.ts의 한국어 원문을 그대로 옮긴다(카피는 임의로 바꾸지 않는다).
// 키만 먼저 잡고 값은 ko만 채운다. 4개 언어 전량 이식은 S5에서 한다.
// 표시는 [v1] 원문 그대로, [신규] v2에서 새로 쓴 문구. 신규 문구는 사용자 확인 대상이다.

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
  // [신규] 일시적 실패(스펙 D-7)
  retry: "다시 시도",
  err_network: "연결이 잠시 끊겼어요.",
  // [신규] S2 확인 화면. S3에서 어휘 목록으로 교체된다
  handoff_title: "여기까지 좁혔어요",
  handoff_next: "어휘 생성은 다음 단계에서 붙습니다.",
} as const;

export type StringKey = keyof typeof ko;

// {n} 같은 자리표시자를 채운다. 값이 없으면 원문을 그대로 둔다.
export function tr(key: StringKey, vars?: Record<string, string | number>): string {
  const raw: string = ko[key];
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}
