// 파이프라인 입출력 타입(P1~P5·preview·relate). 정본 = 인터페이스계약-v2 §2-1. 키 변동 금지.
// PreviewIn/Out·RelateIn/Out은 v1 코드가 정본이며 여기로 무손실 이식한다.

import type { JobType, GapType, Tag, Locale, DomainRisk } from "./enums.js";

// 좁히기 단계의 선택지.
export interface Choice {
  label: string;
  // 도메인 태그. 연속 클릭 시 태그가 갈리는지 보는 품질 가드용.
  domain_tag?: string;
}

// 추천 어휘 카드. 프롬프트3 출력.
// 필수 필드와 조건부 필드를 구분한다. 조건부는 gap_type 또는 job_type에 따라 켠다.
export interface Term {
  // 필수
  term: string;
  kind: string; // 단어 종류. 개념, 기법, 현상, 지표 등 자유 문자열.
  priority: number; // 1이 최우선. 오름차순.
  why: string; // 이 상황에서 왜 이 우선순위인지 근거.
  one_line: string; // 한 줄 정의.
  tag: Tag;
  group?: string; // 그룹뷰 분류(프론트 groupView). 예: 일반화, 학습 설정.
  // 조건부 (gap_type 또는 job_type에 따라 켬)
  direction?: string; // 적용 방향. gap_type c d e 또는 의사결정 진단판단 협상설득준비에서 켬.
  use_example?: string; // 용례. 글쓰기 job_type 또는 gap_type c에서 켬.
  context_note?: string; // 맥락 주의. gap_type d e에서 켬.
  relates_to?: string[]; // 같이 묶어 봐야 하는 핵심 term 참조. gap_type b에서 켬.
  order?: number; // 관계 순서. gap_type b에서 켬.
  gap_type?: GapType; // 어휘별 유형. 있으면 세션 기본값 대신 이 값으로 필드를 켠다.
  difficulty?: "기초" | "중급" | "심화"; // 사용자가 고른 어휘 깊이. 리스트 전체가 이 난이도로 생성된다.
}

// 출처. 어휘 상세(P5)에서 노출. site는 URL 호스트에서 파생한다(어댑터/core 책임).
export interface Source {
  title: string;
  site: string;
  url: string;
}

// 검색 공급자 결과 문서.
export interface RagDoc {
  title: string;
  url: string;
  content: string;
}

// 스트리밍 이벤트. core/llm이 DeepSeek 바이트를 이 타입으로 변환해 내보낸다.
// 어댑터가 SSE 바이트로 직렬화하고, 프론트가 다시 이 타입으로 파싱한다.
export type StreamEvent =
  | { type: "term"; term: Term }
  | { type: "done" }
  | { type: "error"; code: string; message: string };

// 프롬프트 입출력 계약. 키 변동 금지.

export interface Prompt1In {
  raw_input: string;
  context_object?: string;
  user_condition?: string; // 진입 화면에서 사용자가 적은 좁힘 조건. 첫 분기와 어휘 선정에 반영한다.
  project_context?: string; // 프로젝트(폴더) 제목. 아키네이터를 그 영역으로 부드럽게 기울이는 사전(약함). 입력이 명백히 다르면 입력 우선.
}
export interface Prompt1Out {
  domain: string;
  job_type: JobType[]; // 최대 2개(복수 작업)
  user_condition?: string;
  condition_required: boolean; // true면 프론트가 조건 입력을 권장으로 승격
  question: string;
  choices: Choice[];
  // 라우팅에 필요한 분류 필드
  search_locale: Locale;
  domain_risk: DomainRisk;
}

export interface Prompt2In {
  domain: string;
  job_type: JobType[];
  history: { label: string; action: "선택" }[];
  remaining_tags?: string[];
  context_object?: string;
  user_condition?: string;
  project_context?: string; // 프로젝트(폴더) 제목. 좁히기 매 턴을 그 영역으로 부드럽게 기울이는 사전(약함). 선택이 명백히 다르면 선택 우선.
  simplify?: boolean; // "선택지가 어려워요" 이후. 질문·선택지를 더 쉬운 말로.
}
export interface Prompt2Out {
  question: string;
  choices: Choice[];
  // 좁히기 종료 신호(D1). 백엔드가 [3,8] 엔벨로프 안에서 판단한다.
  enough: boolean; // true면 프론트가 더 묻지 않고 recommend로 진행한다.
  confidence: number; // 0..1. UI 힌트("거의 다 좁혔어요")에 쓴다.
}

export interface Prompt3In {
  area: string;
  job_type: JobType[];
  user_condition?: string;
  context_object?: string;
  gap_type?: GapType[]; // 프롬프트1과 2가 추론한 세션 기본값. 복합이면 배열.
  topic?: string; // 사용자 원래 요청. 앵커(이미 아는 용어) 식별용. 추천에서 제외.
  difficulty?: "기초" | "중급" | "심화"; // 좁히기 종료 직전 사용자가 고른 어휘 깊이. 추천 전체를 이 깊이로 편향.
}
export interface Prompt3Out {
  terms: Term[]; // priority 오름차순
}

export interface Prompt4In {
  area: string;
  job_type: JobType[];
  vocab: { term: string; tag: Tag }[];
  user_condition?: string; // 화면3 우선 병합 최종값(화면0 값을 덮음)
  context_object?: string;
  background_hint?: string;
}
export interface Prompt4Out {
  area: string;
  task_intent: string;
  user_condition?: string;
  context_object?: string;
  context_sentence: string;
  vocab: { term: string; tag: Tag }[];
  paste_text: string; // 복사와 공유가 넘기는 최종 한 덩어리
}

export interface Prompt5In {
  term: string;
  kind: string;
  area: string;
  job_type: JobType[];
  // 출처 근거용(D2). recommend RAG 캐시 재사용 키 조립에 쓴다.
  domain: string;
  topic: string;
  locale: Locale;
  connection_hint?: string; // 연결 턴에서 사용자가 확정한 정렬(프로젝트 제목과 이미 아는 어휘, 고른 방향). 상세 설명에 약하게만 반영한다.
}
export interface Prompt5Out {
  // 프론트 상세 3단 구조(D2).
  what: string; // 개념(이게 뭐냐).
  whymine: string; // 내 맥락(왜 나에게 중요).
  how: string; // 활용(어떻게 쓰냐).
  misc?: string; // 보조 콜아웃(있을 때만).
  // related는 상세 열람용 일반 관련어다. Term.relates_to와 다른 개념이다.
  related: string[];
  sources: Source[]; // 출처 필수. 확신 가는 귀속만, 애매하면 빈 배열(프론트 폴백).
}

// 난이도 프리뷰. 좁히기 종료 직전 난이도(기초/중급/심화)를 고르기 전에, 좁혀진 주제의 깊이별 대표 어휘를
// 하나씩 미리 보여 줘 사용자가 감으로 고르게 돕는다. RAG 없이 1회 생성, 한도 미집계(좁히기와 같은 비용 등급).
export interface PreviewIn {
  area: string;
  job_type: JobType[];
  history: string[]; // 좁히기에서 고른 답 라벨들
  topic?: string; // 사용자 원래 요청(앵커 회피용)
}
export interface PreviewOut {
  basic: { term: string; line: string };
  inter: { term: string; line: string };
  adv: { term: string; line: string };
}

// 연결 턴(프로젝트 누적 kept 어휘). 좁히기 종료 직전, 같은 프로젝트에서 이미 담은 어휘가 지금 좁힌 작업과
// 진짜로 연결되는지 LLM이 판정해, 연결이 있으면 재인 질문 한 턴으로 드러낸다(없으면 relevant=false로 스킵).
// 사용자의 명시적 선택만 추천(user_condition)과 dedup(exclude)에 반영해 "조용한 주입" 오염을 피한다.
export interface RelateIn {
  area: string;
  job_type: JobType[];
  history: string[]; // 좁히기에서 고른 답 라벨들(preview와 동일)
  topic?: string; // 사용자 원래 요청
  kept: { term: string; one_line: string; area?: string }[]; // 같은 도메인 프리필터 후 캡한 프로젝트 kept
}
export interface RelateOut {
  relevant: boolean; // false면 프론트가 이 턴을 건너뛴다(연결 없음 또는 희박)
  question: string;
  choices: Choice[]; // 연결 방향 2~3개. "관련 없어요" 탈출구는 프론트가 덧붙인다.
  related_terms: string[]; // 질문이 근거한 kept 용어(연결 노출 UI)
}
