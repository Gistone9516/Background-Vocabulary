// 서버 에러를 판별 유니온 하나로 좁힌다.
// 화면 코드에 상태 코드 숫자나 서버 에러 문자열이 나타나면 규약 위반이다. 분류는 여기서만 한다.
// 서버 응답 본문은 { error: "CODE", message: "한국어 문구" } 형태다(http-app 게이팅 미들웨어).

import type { StringKey } from "../i18n/strings.js";

export type ApiError =
  | { kind: "weekly_exhausted"; message: string }
  | { kind: "pro_only"; message: string }
  // 무료 상세 열람 소진(S3b D-3). pro_only와 달리 이번 주가 지나면 풀린다.
  | { kind: "detail_limit"; message: string }
  | { kind: "high_risk"; message: string }
  | { kind: "rate_limited"; message: string }
  | { kind: "capacity"; message: string }
  // 인증 계열. 이전에는 전부 server로 떨어져 화면이 로그인 실패와 세션 만료를
  // 구분하지 못했다(스펙 A-9).
  | { kind: "auth_failed"; message: string } // 로그인 자체가 실패. 다시 로그인
  | { kind: "session_expired"; message: string } // 토큰 만료·폐기. 재발급 또는 재로그인
  | { kind: "auth_required"; message: string } // 로그인이 필요한 자원에 비로그인 접근
  // 영속 CRUD 계열(S5). 이전에는 전부 server로 떨어져 화면이 "없음"과 "남의 것"을 구분하지 못했다.
  | { kind: "not_found"; message: string } // 없거나 이미 지워졌다
  // 복구 유예가 지난 삭제. not_found와 묶여 있었으나 화면에 뜨는 말이 다르므로 갈랐다(S-35) —
  // 하나의 kind가 두 문구를 갖고 있으면 코드에서 키를 정할 수 없다
  | { kind: "not_restorable"; message: string }
  | { kind: "ownership_conflict"; message: string } // 그 id가 다른 계정 소유다
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
    case "DETAIL_LIMIT":
      return { kind: "detail_limit", message: say(b, "무료 상세 열람을 다 썼어요.") };
    case "PRO_ONLY":
      return { kind: "pro_only", message: say(b, "pro 전용 기능이에요.") };
    case "HIGH_RISK_REFUSED":
      return { kind: "high_risk", message: say(b, "안전상 직접 다루지 않는 주제예요.") };
    case "RATE_LIMITED":
      return { kind: "rate_limited", message: say(b, "잠시 후 다시 시도해 주세요.") };
    // 전역 캡은 "당신이 많이 썼다"가 아니라 "우리 쪽이 혼잡하다"다. 같은 종류로 접으면
    // 사용자가 자기 잘못으로 읽고, 기다려도 안 풀릴 수 있다는 것을 알 방법이 없다.
    case "CAPACITY":
      return { kind: "capacity", message: say(b, "지금 서비스가 혼잡해요.") };
    case "AUTH_FAILED":
      return { kind: "auth_failed", message: say(b, "로그인에 실패했어요. 다시 시도해 주세요.") };
    case "TOKEN_REVOKED":
    case "TOKEN_EXPIRED":
      return { kind: "session_expired", message: say(b, "세션이 만료되었어요. 다시 로그인해 주세요.") };
    case "AUTH_REQUIRED":
    // 영속 라우트는 비로그인을 UNAUTHENTICATED로 답한다(crud-routes.ts). 같은 뜻이라 같이 묶는다.
    case "UNAUTHENTICATED":
      return { kind: "auth_required", message: say(b, "로그인이 필요해요.") };
    case "NOT_FOUND":
      return { kind: "not_found", message: say(b, "찾을 수 없어요.") };
    case "NOT_RESTORABLE":
      return { kind: "not_restorable", message: say(b, "되돌릴 수 있는 기간이 지났어요.") };
    case "OWNERSHIP_CONFLICT":
      return { kind: "ownership_conflict", message: say(b, "다른 계정의 기록이라 저장할 수 없어요.") };
    default:
      return { kind: "server", status, message: say(b, "요청을 처리하지 못했어요.") };
  }
}

// 오류 종류 -> 화면에 띄울 문구 키(S-35). 서버가 보낸 message는 진단용으로만 남고 화면에 가지 않는다.
//
// 왜 서버 문구를 안 쓰는가: 서버는 로케일을 모르고 한국어만 보낸다(`gating.ts`·`auth-routes.ts`).
// 그대로 띄우면 영어 화면에 한국어 오류가 뜬다. 계약도 클라 문구를 정본으로 지목한다.
// 이 파일의 위쪽 주석("서버 문구를 그대로 싣는다")이 걱정한 것은 문구 이중화인데, **코드는 열거
// 가능하고 문구는 그렇지 않다** — 코드로 맞추면 서버가 문구를 바꿔도 어긋날 것이 없다.
//
// Record로 둔 것이 요점이다. kind를 추가하고 키를 정하지 않으면 타입 검사가 막는다.
// 화면마다 캐스트로 message를 꺼내던 것이 세 곳에 복제돼 있었고, 그것을 여기 하나로 접었다.
const ERROR_KEY: Record<ApiError["kind"], StringKey> = {
  weekly_exhausted: "weekly_exhausted",
  pro_only: "err_pro_only",
  detail_limit: "err_detail_limit",
  high_risk: "refusal_title",
  rate_limited: "err_rate_limited",
  capacity: "err_capacity",
  auth_failed: "err_auth_failed",
  session_expired: "err_session_expired",
  auth_required: "err_auth_required",
  not_found: "err_not_found",
  not_restorable: "session_undo_expired",
  ownership_conflict: "err_ownership",
  network: "err_network",
  malformed: "err_malformed",
  server: "err_server",
};

export function errorKey(e: ApiError): StringKey {
  return ERROR_KEY[e.kind];
}

// 다시 눌러 볼 만한 실패인지. 이 판정이 좁히기를 끝낼지 화면에 머물지를 가른다(스펙 D-7).
export function isRetryable(e: ApiError): boolean {
  if (e.kind === "network" || e.kind === "rate_limited" || e.kind === "capacity") return true;
  return e.kind === "server" && e.status >= 500;
}

export function isApiError(v: unknown): v is ApiError {
  return !!v && typeof v === "object" && typeof (v as ApiError).kind === "string";
}
