// Google OAuth 코드 교환과 ID 토큰 처리. 정본 계약은 인터페이스계약 8장이다.
// launchWebAuthFlow 가 받은 authorization code 를 Worker 가 client_secret 으로 교환한다.
// client_secret 은 절대 클라이언트에 노출하지 않는다. 이 모듈은 Worker(어댑터) 전용이다.

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

interface GoogleTokenResponse {
  id_token?: string;
  error?: string;
  error_description?: string;
}

// ID 토큰에서 우리가 쓰는 신원 필드.
export interface GoogleIdentity {
  sub: string;
  email: string;
  email_verified: boolean;
}

export interface GoogleExchangeArgs {
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  clientSecret: string;
}

// JWT payload 부분만 디코드한다. 서명 재검증은 아래 교환 함수의 주석을 참고.
function decodeJwtPayload(idToken: string): Record<string, unknown> | null {
  const parts = idToken.split(".");
  const seg = parts[1];
  if (parts.length !== 3 || !seg) return null;
  try {
    const pad = seg.length % 4 === 0 ? "" : "=".repeat(4 - (seg.length % 4));
    const bin = atob(seg.replace(/-/g, "+").replace(/_/g, "/") + pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

// authorization code 를 교환해 사용자 신원을 돌려준다. 실패하면 throw 한다.
export async function exchangeGoogleCode(args: GoogleExchangeArgs): Promise<GoogleIdentity> {
  const form = new URLSearchParams({
    code: args.code,
    client_id: args.clientId,
    client_secret: args.clientSecret,
    redirect_uri: args.redirectUri,
    grant_type: "authorization_code",
    code_verifier: args.codeVerifier,
  });
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as GoogleTokenResponse;
  if (!res.ok || !data.id_token) {
    throw new Error(`google_exchange_failed ${data.error ?? res.status} ${data.error_description ?? ""}`.trim());
  }
  const payload = decodeJwtPayload(data.id_token);
  if (!payload) throw new Error("google_idtoken_unparsable");
  // ID 토큰을 Google 토큰 엔드포인트에서 TLS 직결로 직접 받으므로 중간자가 없어 서명 재검증은 생략한다
  // (Google 공식 가이드가 이 경로에 한해 허용). 대신 iss 와 aud 를 확인해 오발급 토큰을 거른다.
  const iss = payload["iss"];
  const aud = payload["aud"];
  const sub = payload["sub"];
  const email = payload["email"];
  if (iss !== "https://accounts.google.com" && iss !== "accounts.google.com") throw new Error("google_bad_iss");
  if (aud !== args.clientId) throw new Error("google_bad_aud");
  if (typeof sub !== "string" || typeof email !== "string") throw new Error("google_missing_claims");
  return {
    sub,
    email,
    email_verified: payload["email_verified"] === true || payload["email_verified"] === "true",
  };
}
