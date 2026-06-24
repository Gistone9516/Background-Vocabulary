// SoT 타입 정의. 단일 출처는 기획 구체화 5장과 5-1 인터페이스 계약이다.
// 1단계 병렬 에이전트는 이 파일을 읽기만 하고 수정하지 않는다(수정은 opus 경유).
// 키 이름은 변동 금지(파싱 계약). 실행 로직은 여기 두지 않는다(utils.ts로 분리).

// 작업 유형. 기획 3-2 작업유형 분기와 단일 출처이며 키 변동 금지.
export const JOB_TYPES = [
  "보고서작성",
  "의사결정",
  "서류제출",
  "이해학습",
  "진단판단",
  "문제해결",
  "협상설득준비",
  "전문가면담준비",
  "기획전략",
] as const;
export type JobType = (typeof JOB_TYPES)[number];

// 막힘 유형. a는 뜻 모름, b는 관계/순서, c는 용례 전환, d는 적용 방향, e는 맥락.
export const GAP_TYPES = ["a", "b", "c", "d", "e"] as const;
export type GapType = (typeof GAP_TYPES)[number];

// 어휘 태깅 상태.
export const TAGS = ["알아", "몰라", "적용모름"] as const;
export type Tag = (typeof TAGS)[number];

// 검색 언어. 진입 분류에서 검색 전에 한 번 결정한다.
export type Locale = "en" | "ko";

// 도메인 위험도. high는 고위험 도메인으로 거부 라우팅 대상이다.
export type DomainRisk = "low" | "high";

// 모델 식별자. 리터럴 union 금지. 허용 목록 검증은 어댑터에서만 한다.
// 이렇게 두면 fallback 모델 교체 시 SoT를 수정하지 않아도 된다.
export type ModelId = string;

// 좁히기 단계의 선택지. 기획 3-3 Choice 스키마.
export interface Choice {
  label: string;
  // 도메인 태그. 연속 클릭 시 태그가 갈리는지 보는 품질 가드용(기획 3-2).
  domain_tag?: string;
}

// 추천 어휘 카드. 기획 5-1 프롬프트3 출력.
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
  // 조건부 (gap_type 또는 job_type에 따라 켬, 기획 P27 P28)
  direction?: string; // 적용 방향. gap_type c d e 또는 의사결정 진단판단 협상설득준비에서 켬.
  use_example?: string; // 용례. 글쓰기 job_type 또는 gap_type c에서 켬.
  context_note?: string; // 맥락 주의. gap_type d e에서 켬.
  relates_to?: string[]; // 같이 묶어 봐야 하는 핵심 term 참조. gap_type b에서 켬.
  order?: number; // 관계 순서. gap_type b에서 켬.
  gap_type?: GapType; // 어휘별 유형. 있으면 세션 기본값 대신 이 값으로 필드를 켠다(기획 P30).
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
// 어댑터가 SSE 바이트로 직렬화하고, 사이드패널이 다시 이 타입으로 파싱한다.
export type StreamEvent =
  | { type: "term"; term: Term }
  | { type: "done" }
  | { type: "error"; code: string; message: string };

// 프롬프트 입출력 계약. 정본은 기획 5-1. 키 변동 금지.

export interface Prompt1In {
  raw_input: string;
  context_object?: string;
}
export interface Prompt1Out {
  domain: string;
  job_type: JobType[]; // 최대 2개(복수 작업)
  user_condition?: string;
  condition_required: boolean; // true면 프론트가 조건 입력을 권장으로 승격
  question: string;
  choices: Choice[];
  // 구현계획 6장 라우팅에 필요한 분류 필드
  search_locale: Locale;
  domain_risk: DomainRisk;
}

export interface Prompt2In {
  domain: string;
  job_type: JobType[];
  history: { label: string; action: "선택" | "더깊이" }[];
  remaining_tags?: string[];
  context_object?: string;
  user_condition?: string;
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
}
export interface Prompt3Out {
  terms: Term[]; // priority 오름차순
}

export interface Prompt4In {
  area: string;
  job_type: JobType[];
  vocab: { term: string; tag: Tag }[];
  user_condition?: string; // 화면3 우선 병합 최종값(화면0 값을 덮음, 기획 P26)
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
  deepen?: boolean; // "더 깊이(예시·비유 추가)" 클릭 시.
}
export interface Prompt5Out {
  // 프론트 상세 3단 구조(D2). 정본 = panel.html detailHTML.
  what: string; // 개념(이게 뭐냐).
  whymine: string; // 내 맥락(왜 나에게 중요).
  how: string; // 활용(어떻게 쓰냐).
  misc?: string; // 보조 콜아웃(있을 때만).
  // related는 상세 열람용 일반 관련어다. Term.relates_to와 다른 개념이다(기획 P28).
  related: string[];
  sources: Source[]; // 출처 필수. 확신 가는 귀속만, 애매하면 빈 배열(프론트 폴백).
  example?: string; // deepen 시 추가 예시.
}
