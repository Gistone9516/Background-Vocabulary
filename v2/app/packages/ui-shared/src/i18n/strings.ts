// UI 문구. v1 i18n.ts의 한국어 원문을 그대로 옮긴다(카피는 임의로 바꾸지 않는다).
// S1 범위의 키만 담고, 4개 언어 전량 이식은 S5에서 한다.

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
} as const;

export type StringKey = keyof typeof ko;

export function tr(key: StringKey): string {
  return ko[key];
}
