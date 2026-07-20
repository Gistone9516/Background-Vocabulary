// 열거·별칭 타입. 파싱 계약이므로 키 값 변동 금지. 정본 = 인터페이스계약-v2 §2.
// 실행 로직은 여기 두지 않는다(utils.ts로 분리).

// 작업 유형. 작업유형 분기의 단일 출처이며 키 변동 금지.
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

// 요금 티어. 무료(flash 한도)와 유료(pro 무제한). 게이팅과 출력량 차등의 기준.
export type Tier = "free" | "paid";

// 검색 언어. 진입 분류에서 검색 전에 한 번 결정한다.
export type Locale = "en" | "ko";

// 출력(사용자에게 보일 콘텐츠) 언어. RAG 검색 언어(Locale)와 별개다.
// 사용자 OS/브라우저 언어 또는 수동 선택에서 온다. 카드·상세·질문 등 모든 LLM 출력 텍스트의 언어.
export type OutputLocale = "ko" | "en" | "ja" | "zh";
export const OUTPUT_LOCALES: OutputLocale[] = ["ko", "en", "ja", "zh"];

// 도메인 위험도. high는 고위험 도메인으로 거부 라우팅 대상이다.
export type DomainRisk = "low" | "high";

// 모델 식별자. 리터럴 union 금지. 허용 목록 검증은 어댑터에서만 한다.
// 이렇게 두면 fallback 모델 교체 시 계약을 수정하지 않아도 된다.
export type ModelId = string;
