// 자체 발급 JWT. HS256으로 서명하며 WebCrypto만 쓴다(외부 의존 없음, 이식성 경계 §0-1 허용).
// 액세스 15분, 리프레시 30일. 시각은 epoch 초(JWT 표준). v1 §8 이식(로직 verbatim).

import type { AccessTokenClaims, RefreshTokenClaims, Tier } from "@vock/shared";

const ACCESS_TTL_SEC = 15 * 60;
const REFRESH_TTL_SEC = 30 * 24 * 60 * 60;

interface JwtHeader {
  alg: "HS256";
  typ: "JWT";
  kid: string;
}

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlEncodeStr(s: string): string {
  return b64urlEncode(new TextEncoder().encode(s));
}
function b64urlDecodeBytes(s: string): Uint8Array<ArrayBuffer> {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}
function b64urlDecodeStr(s: string): string {
  return new TextDecoder().decode(b64urlDecodeBytes(s));
}

async function importKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function randomJti(): string {
  return b64urlEncode(crypto.getRandomValues(new Uint8Array(16)));
}

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

async function signToken(payload: object, secret: string, kid: string): Promise<string> {
  const header: JwtHeader = { alg: "HS256", typ: "JWT", kid };
  const signingInput = b64urlEncodeStr(JSON.stringify(header)) + "." + b64urlEncodeStr(JSON.stringify(payload));
  const key = await importKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return signingInput + "." + b64urlEncode(new Uint8Array(sig));
}

// 후보 시크릿(현재·이전 키)으로 차례로 검증해 키 로테이션을 흡수한다. 서명과 exp만 본다(networkless).
async function verifyToken(token: string, secrets: string[]): Promise<Record<string, unknown> | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;
  if (!h || !p || !s) return null;
  const signingInput = h + "." + p;
  let sigBytes: Uint8Array<ArrayBuffer>;
  try {
    sigBytes = b64urlDecodeBytes(s);
  } catch {
    return null;
  }
  const input = new TextEncoder().encode(signingInput);
  let ok = false;
  for (const secret of secrets) {
    if (!secret) continue;
    try {
      const key = await importKey(secret);
      if (await crypto.subtle.verify("HMAC", key, sigBytes, input)) {
        ok = true;
        break;
      }
    } catch {
      // 다음 후보 키로 넘어간다.
    }
  }
  if (!ok) return null;
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(b64urlDecodeStr(p));
  } catch {
    return null;
  }
  const exp = claims["exp"];
  if (typeof exp !== "number" || exp < nowSec()) return null;
  return claims;
}

export interface IssuedTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number; // 액세스 토큰 수명(초)
}

export async function issueTokens(args: { userId: string; tier: Tier; email: string }, secret: string, kid: string): Promise<IssuedTokens> {
  const iat = nowSec();
  const access: AccessTokenClaims = { sub: args.userId, tier: args.tier, email: args.email, iat, exp: iat + ACCESS_TTL_SEC, jti: randomJti() };
  const refresh: RefreshTokenClaims = { sub: args.userId, typ: "refresh", iat, exp: iat + REFRESH_TTL_SEC, jti: randomJti() };
  const [access_token, refresh_token] = await Promise.all([signToken(access, secret, kid), signToken(refresh, secret, kid)]);
  return { access_token, refresh_token, expires_in: ACCESS_TTL_SEC };
}

export async function verifyAccess(token: string, secrets: string[]): Promise<AccessTokenClaims | null> {
  const claims = await verifyToken(token, secrets);
  if (!claims) return null;
  if (claims["typ"] === "refresh") return null; // 리프레시 토큰을 액세스로 못 쓰게 막는다.
  const tier = claims["tier"];
  if (claims["sub"] == null || claims["email"] == null) return null;
  if (tier !== "free" && tier !== "paid") return null;
  return claims as unknown as AccessTokenClaims;
}

export async function verifyRefresh(token: string, secrets: string[]): Promise<RefreshTokenClaims | null> {
  const claims = await verifyToken(token, secrets);
  if (!claims) return null;
  if (claims["typ"] !== "refresh") return null;
  if (typeof claims["sub"] !== "string") return null;
  return claims as unknown as RefreshTokenClaims;
}
