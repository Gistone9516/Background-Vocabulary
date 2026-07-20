// Google OAuth 코드 교환(공급자 어댑터). v1 §8 google.ts 이식.
// authorization code를 서버가 client_secret으로 교환한다(secret은 절대 클라 노출 금지).
// id_token을 Google 토큰 엔드포인트에서 TLS 직결 수신하므로 서명 재검증은 생략하고 iss/aud/sub/email만 검증한다.

import type { GoogleOAuthClient, GoogleIdentity } from "@vock/shared";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
}

// platform별 클라이언트(웹/데스크톱은 타입별 등록, §3-2). desktop 미설정 시 web으로 폴백.
export interface GoogleOAuthConfig {
  web: GoogleCredentials;
  desktop?: GoogleCredentials;
}

interface GoogleTokenResponse {
  id_token?: string;
  error?: string;
  error_description?: string;
}

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

export class RealGoogleOAuthClient implements GoogleOAuthClient {
  constructor(private readonly config: GoogleOAuthConfig) {}

  async exchange(args: { code: string; codeVerifier: string; redirectUri: string; platform: "web" | "desktop" }): Promise<GoogleIdentity> {
    const cred = args.platform === "desktop" ? this.config.desktop ?? this.config.web : this.config.web;
    const form = new URLSearchParams({
      code: args.code,
      client_id: cred.clientId,
      client_secret: cred.clientSecret,
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
    const iss = payload["iss"];
    const aud = payload["aud"];
    const sub = payload["sub"];
    const email = payload["email"];
    if (iss !== "https://accounts.google.com" && iss !== "accounts.google.com") throw new Error("google_bad_iss");
    if (aud !== cred.clientId) throw new Error("google_bad_aud");
    if (typeof sub !== "string" || typeof email !== "string") throw new Error("google_missing_claims");
    return { sub, email, email_verified: payload["email_verified"] === true || payload["email_verified"] === "true" };
  }
}
