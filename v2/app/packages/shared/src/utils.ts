// 순수 함수. 타입과 분리해 두어 types의 읽기 전용 성격을 지킨다.

// 캐시키용 topic 정규화. 책임을 LLM이 아니라 코드에 둔다.
// 소문자화, 공백 정리, 한국어 조사 제거를 한다.
// 형태소나 동의어 수렴은 하지 않는다. 필요하면 캐시 적중률 실측 후
// 아래 TOPIC_ALIAS에 5개에서 10개 쌍을 추가해 보강한다(지금은 추측 선구현 회피).
const PARTICLES = ["은", "는", "이", "가", "을", "를", "의", "에", "와", "과", "로", "으로"];

// 동의어 별칭. 실측 전까지 비워 둔다.
const TOPIC_ALIAS: Record<string, string> = {};

export function normalizeTopic(raw: string): string {
  let s = (raw ?? "").toLowerCase().trim();
  // 연속 공백을 하나로
  s = s.replace(/\s+/g, " ");
  // 토큰 끝의 한국어 조사 제거
  s = s
    .split(" ")
    .map((tok) => {
      for (const p of PARTICLES) {
        if (tok.length > p.length && tok.endsWith(p)) return tok.slice(0, -p.length);
      }
      return tok;
    })
    .join(" ");
  const alias = TOPIC_ALIAS[s];
  return alias ?? s;
}

// 캐시키 조립. domain은 정적 맵의 열거 키여야 한다(자유 문장 금지).
export function ragCacheKey(domain: string, topic: string, locale: string): string {
  return `rag:${domain}:${normalizeTopic(topic)}:${locale}`;
}
