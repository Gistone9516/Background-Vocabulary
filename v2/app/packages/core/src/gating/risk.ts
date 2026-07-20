// 고위험 입력 1차 방어(NFR-306). LLM domain_risk 판정 이전의 입구 게이트.
// 배경 어휘 학습 도구이므로 도메인 용어(암·종양 등) 자체는 막지 않고,
// 개인적 진단·법적 판단 요청·자해 의도 같은 "개인 위해" 신호에 한해 보수적으로 차단한다.
// 거친 1차 방어이며 정밀 판정은 LLM 2차(domain_risk)가 담당한다(SoT §4).

const HIGH_RISK_PATTERNS: RegExp[] = [
  // 자해·자살 의도
  /자살|자해|극단적\s*선택|suicide|self[-\s]?harm|kill\s+myself/i,
  // 개인 의료 진단·처방 요청("내/제 증상", "무슨 병", "몇 mg 먹")
  /(내|제)\s*(증상|병|통증)|무슨\s*병|자가\s*진단|몇\s*(mg|밀리그램)\s*(먹|복용)|self[-\s]?diagnos|what\s+(disease|illness)\s+do\s+i/i,
  // 개인 법적 판단 요청("내 형량", "고소하면 이길", "합의금 얼마")
  /(내|제)\s*형량|고소하면\s*이길|합의금\s*얼마|will\s+i\s+win\s+(the\s+)?(lawsuit|case)/i,
];

export function isHighRiskInput(text: string | undefined | null): boolean {
  const t = text ?? "";
  return HIGH_RISK_PATTERNS.some((re) => re.test(t));
}
