// 서버 에러를 판별 유니온 하나로 좁힌다.
// 화면 코드에 상태 코드 숫자나 서버 에러 문자열이 나타나면 규약 위반이다. 분류는 여기서만 한다.
// 서버 응답 본문은 { error: "CODE", message: "한국어 문구" } 형태다(http-app 게이팅 미들웨어).

export type ApiError =
  | { kind: "weekly_exhausted"; message: string }
  | { kind: "pro_only"; message: string }
  | { kind: "high_risk"; message: string }
  | { kind: "rate_limited"; message: string }
  // 인증 계열. 이전에는 전부 server로 떨어져 화면이 로그인 실패와 세션 만료를
  // 구분하지 못했다(스펙 A-9).
  | { kind: "auth_failed"; message: string } // 로그인 자체가 실패. 다시 로그인
  | { kind: "session_expired"; message: string } // 토큰 만료·폐기. 재발급 또는 재로그인
  | { kind: "auth_required"; message: string } // 로그인이 필요한 자원에 비로그인 접근
  | { kind: "network" }
  | { kind: "malformed" }
  | { kind: "server"; status: number; message: string };

interface ErrorBody {
  error?: string;
  message?: string;
}

// 서버 문구를 그대로 싣는다. 같은 문구를 클라에 복제해 두면 서버가 바뀔 때 조용히 어긋난다.
function say(body: ErrorBody | null, fallback: string): string {
  return typeof body?.message === "string" && body.message ? body.message : fallback;
}

export function classifyResponse(status: number, body: unknown): ApiError {
  const b = (body && typeof body === "object" ? body : null) as ErrorBody | null;
  switch (b?.error) {
    case "WEEKLY_LIMIT":
      return { kind: "weekly_exhausted", message: say(b, "이번 주 무료 탐색을 다 썼어요.") };
    case "PRO_ONLY":
      return { kind: "pro_only", message: say(b, "pro 전용 기능이에요.") };
    case "HIGH_RISK_REFUSED":
      return { kind: "high_risk", message: say(b, "안전상 직접 다루지 않는 주제예요.") };
    case "RATE_LIMITED":
    case "CAPACITY":
      return { kind: "rate_limited", message: say(b, "잠시 후 다시 시도해 주세요.") };
    case "AUTH_FAILED":
      return { kind: "auth_failed", message: say(b, "로그인에 실패했어요. 다시 시도해 주세요.") };
    case "TOKEN_REVOKED":
    case "TOKEN_EXPIRED":
      return { kind: "session_expired", message: say(b, "세션이 만료되었어요. 다시 로그인해 주세요.") };
    case "AUTH_REQUIRED":
      return { kind: "auth_required", message: say(b, "로그인이 필요해요.") };
    default:
      return { kind: "server", status, message: say(b, "요청을 처리하지 못했어요.") };
  }
}

// 다시 눌러 볼 만한 실패인지. 이 판정이 좁히기를 끝낼지 화면에 머물지를 가른다(스펙 D-7).
export function isRetryable(e: ApiError): boolean {
  if (e.kind === "network" || e.kind === "rate_limited") return true;
  return e.kind === "server" && e.status >= 500;
}

export function isApiError(v: unknown): v is ApiError {
  return !!v && typeof v === "object" && typeof (v as ApiError).kind === "string";
}
