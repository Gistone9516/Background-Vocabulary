// PKCE 준비값 생성. 순수 로직만 두고 난수와 해시는 웹 크립토를 쓴다.
//
// code_verifier 는 교환 때 서버로 간다. state 는 서버 계약에 없다 —
// 리다이렉트 위조를 막는 클라이언트 측 장치라 서버가 볼 일이 없기 때문이다.
// 계약에 없다고 쓰지 않는 것이 아니라, 클라가 반드시 쓰고 클라가 대조한다(스펙 A-3·A-4).

const VERIFIER_BYTES = 32; // base64url로 43자. RFC 7636 권장 범위 안쪽

function base64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBase64Url(byteLength: number): string {
  const buf = new Uint8Array(byteLength);
  crypto.getRandomValues(buf);
  return base64Url(buf);
}

export async function challengeOf(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

export interface PkcePrep {
  verifier: string;
  challenge: string;
  state: string;
}

export async function preparePkce(): Promise<PkcePrep> {
  const verifier = randomBase64Url(VERIFIER_BYTES);
  return { verifier, challenge: await challengeOf(verifier), state: randomBase64Url(16) };
}

// 구글 동의 화면 주소. client_id 가 없으면 만들지 않는다(스펙 A-2).
export function buildAuthorizeUrl(args: {
  clientId: string;
  redirectUri: string;
  challenge: string;
  state: string;
}): string {
  const q = new URLSearchParams({
    client_id: args.clientId,
    redirect_uri: args.redirectUri,
    response_type: "code",
    scope: "openid email",
    code_challenge: args.challenge,
    code_challenge_method: "S256",
    state: args.state,
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${q.toString()}`;
}

// 돌아온 주소에서 code 와 state 를 읽는다. state 가 다르면 교환하지 않는다(A-4).
export function readCallback(search: string, expectedState: string | null): { code: string } | { error: string } {
  const p = new URLSearchParams(search);
  const err = p.get("error");
  if (err) return { error: err };
  const code = p.get("code");
  const state = p.get("state");
  if (!code) return { error: "no_code" };
  if (!expectedState || state !== expectedState) return { error: "state_mismatch" };
  return { code };
}
