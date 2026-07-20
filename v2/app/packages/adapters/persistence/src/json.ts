// jsonb 경계 헬퍼. 드라이버 차이를 리포 경계에서 흡수한다.
// pg는 jsonb를 파싱된 객체로, Data API는 문자열로 준다 — 둘 다 수용한다.

export function asJson<T>(v: unknown): T {
  return typeof v === "string" ? (JSON.parse(v) as T) : (v as T);
}

export function asJsonOrNull<T>(v: unknown): T | null {
  if (v === null || v === undefined) return null;
  return asJson<T>(v);
}

// jsonb 바인딩용 직렬화(SQL에서 $n::jsonb 캐스트). 양 드라이버 공통.
export function toJsonParam(v: unknown): string {
  return JSON.stringify(v ?? null);
}

// BIGINT는 node-postgres가 문자열로 반환한다. epoch ms는 2^53 미만이라 Number 변환이 안전하다.
export function asNum(v: unknown): number {
  return typeof v === "number" ? v : Number(v);
}

export function asNumOrNull(v: unknown): number | null {
  return v === null || v === undefined ? null : asNum(v);
}
