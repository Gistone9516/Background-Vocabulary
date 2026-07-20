// 로케일 라우팅과 도메인 안전 분류. 정본은 구현계획 6장.
// 정적 맵은 캐시키 도메인 열거 키이면서 hard_domain 플래그를 겸한다.
// LLM이 분류한 locale/risk보다 정적 맵이 우선한다(결정론 경로).

import type { Locale, DomainRisk } from "@vock/shared";

interface DomainEntry {
  locale: Locale;
  risk: DomainRisk;
  hard_domain: boolean;
}

// 알려진 도메인 키와 속성. 키는 캐시키 도메인 열거값과 동일해야 한다.
export const STATIC_DOMAIN_MAP: Record<string, DomainEntry> = {
  // 영어(글로벌 기술, 과학, SW, 스타트업, 디자인)
  pid_control:     { locale: "en", risk: "low",  hard_domain: false },
  robotics:        { locale: "en", risk: "low",  hard_domain: false },
  software:        { locale: "en", risk: "low",  hard_domain: false },
  startup:         { locale: "en", risk: "low",  hard_domain: false },
  ux_research:     { locale: "en", risk: "low",  hard_domain: false },
  ml_deploy:       { locale: "en", risk: "low",  hard_domain: false },
  design_system:   { locale: "en", risk: "low",  hard_domain: false },

  // 한국어(한국 관할 제도, 로컬 시장, 관행)
  local_smb_policy:  { locale: "ko", risk: "low", hard_domain: false },
  real_estate_lease: { locale: "ko", risk: "low", hard_domain: false },
  vat_filing:        { locale: "ko", risk: "low", hard_domain: false },
  labor_contract:    { locale: "ko", risk: "low", hard_domain: false },
  trademark_kr:      { locale: "ko", risk: "low", hard_domain: false },

  // hard_domain: true — flash 사용자도 pro를 쓴다(구현계획 6장 모델 라우팅).
  financial_modeling:    { locale: "en", risk: "low",  hard_domain: true },
  payment_settlement:    { locale: "en", risk: "low",  hard_domain: true },
  ar_vr:                 { locale: "en", risk: "low",  hard_domain: true },

  // 고위험 도메인 — 거부 라우팅 대상(구현계획 6장 고위험 게이트).
  medical_personal:  { locale: "ko", risk: "high", hard_domain: false },
  legal_personal:    { locale: "ko", risk: "high", hard_domain: false },

  // 정적 맵 미스 폴백 키. 맵에 없는 도메인은 "other"로 스냅된다.
  other: { locale: "en", risk: "low", hard_domain: false },
};

// 도메인 자유문장에서 알려진 키를 찾는 키워드 매핑 테이블.
// LLM이 열거 키를 그대로 내려보내면 직접 조회가 되지만,
// 자유문장이나 유사 표현이 들어왔을 때 substring 매칭으로 스냅한다.
const KEYWORD_MAP: { keywords: string[]; key: string }[] = [
  { keywords: ["pid", "pid_control", "pid control"],          key: "pid_control" },
  { keywords: ["robot", "robotics"],                          key: "robotics" },
  { keywords: ["software", "sw", "코드", "개발", "프로그래밍"], key: "software" },
  { keywords: ["startup", "스타트업"],                         key: "startup" },
  { keywords: ["ux", "ux_research", "ux research", "사용자조사"], key: "ux_research" },
  { keywords: ["ml", "ml_deploy", "machine learning", "mlops", "배포"], key: "ml_deploy" },
  { keywords: ["design system", "design_system", "디자인시스템"], key: "design_system" },
  { keywords: ["smb", "소상공인", "local_smb", "자영업"],      key: "local_smb_policy" },
  { keywords: ["부동산", "임대차", "real_estate", "전세", "월세"], key: "real_estate_lease" },
  { keywords: ["vat", "부가세", "vat_filing"],                key: "vat_filing" },
  { keywords: ["labor", "노동", "근로계약", "labor_contract"], key: "labor_contract" },
  { keywords: ["상표", "trademark", "trademark_kr"],          key: "trademark_kr" },
  { keywords: ["financial_model", "재무모델", "dcf", "valuation"], key: "financial_modeling" },
  { keywords: ["payment", "정산", "settlement"],              key: "payment_settlement" },
  { keywords: ["ar", "vr", "ar_vr", "mixed reality", "xr"],  key: "ar_vr" },
  { keywords: ["의료", "진단", "medical"],                     key: "medical_personal" },
  { keywords: ["법률", "법무", "legal"],                       key: "legal_personal" },
];

// 자유 문장 도메인을 정적 맵 열거 키로 스냅한다.
// 직접 키 일치 우선, 그 다음 키워드 포함 매칭, 미스이면 "other" 반환.
function snapDomainKey(domain: string): string {
  const normalized = domain.toLowerCase().trim();

  // 1. 정적 맵 직접 조회
  if (normalized in STATIC_DOMAIN_MAP) {
    return normalized;
  }

  // 2. 키워드 포함 매칭 (순서대로 첫 번째 히트)
  for (const entry of KEYWORD_MAP) {
    for (const kw of entry.keywords) {
      if (normalized.includes(kw)) {
        return entry.key;
      }
    }
  }

  return "other";
}

export interface RoutingResult {
  domainKey: string;
  locale: Locale;
  risk: DomainRisk;
  hardDomain: boolean;
}

// 분류 라우팅 결정 함수.
// 정적 맵이 있으면 맵값으로 locale과 risk를 덮어쓴다(결정론 경로).
// 맵 미스이면 LLM이 내려준 search_locale과 domain_risk를 그대로 쓴다(확률 경로).
export function classifyRouting(p1: {
  domain: string;
  search_locale: Locale;
  domain_risk: DomainRisk;
}): RoutingResult {
  const domainKey = snapDomainKey(p1.domain);
  const entry = STATIC_DOMAIN_MAP[domainKey];

  if (domainKey !== "other" && entry) {
    // 정적 맵 히트: 맵값 우선
    return {
      domainKey,
      locale: entry.locale,
      risk: entry.risk,
      hardDomain: entry.hard_domain,
    };
  }

  // 맵 미스("other") 또는 맵에 없는 키: LLM 분류값 폴백
  return {
    domainKey,
    locale: p1.search_locale,
    risk: p1.domain_risk,
    hardDomain: entry?.hard_domain ?? false,
  };
}
