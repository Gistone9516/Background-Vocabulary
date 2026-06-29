// Google SSO. launchWebAuthFlow 로 code 를 받아 Worker 가 교환하고, 발급된 우리 JWT 를 저장한다.
// getAuthToken 은 쓰지 않는다(브라우저 계정 종속과 기업 차단 회피). 정본 계약은 인터페이스계약 8장이다.
// client_id 는 공개 값이라 빌드 환경변수로 주입한다. client_secret 은 Worker 에만 둔다.

const STORAGE_KEY = "sidetab:auth";
const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) ?? "";
const WORKER_BASE = (import.meta.env.VITE_WORKER_BASE as string | undefined) ?? "https://sidetab-api.example.workers.dev";

export type Plan = "flash" | "pro";
type Tier = "free" | "paid";

interface StoredAuth {
  access_token: string;
  refresh_token: string;
  email: string;
  tier: Tier;
  access_exp: number; // 액세스 토큰 만료 epoch 밀리초
}

function chromeApi(): typeof chrome | undefined {
  return (globalThis as { chrome?: typeof chrome }).chrome;
}

// 저장과 로드. chrome.storage.local 우선이고 없으면(개발) localStorage 로 폴백한다.
async function load(): Promise<StoredAuth | null> {
  const c = chromeApi();
  if (c?.storage?.local) {
    return new Promise((resolve) => {
      c.storage.local.get(STORAGE_KEY, (r: Record<string, unknown>) => {
        const v = r[STORAGE_KEY];
        resolve(v ? (v as StoredAuth) : null);
      });
    });
  }
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v ? (JSON.parse(v) as StoredAuth) : null;
  } catch {
    return null;
  }
}

async function save(a: StoredAuth | null): Promise<void> {
  const c = chromeApi();
  if (c?.storage?.local) {
    return new Promise((resolve) => {
      if (a) c.storage.local.set({ [STORAGE_KEY]: a }, () => resolve());
      else c.storage.local.remove(STORAGE_KEY, () => resolve());
    });
  }
  try {
    if (a) localStorage.setItem(STORAGE_KEY, JSON.stringify(a));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 무시 */
  }
}

// base64url 인코딩이다. 패딩은 떼어 낸다.
function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

// PKCE code_verifier 와 S256 challenge 를 만든다.
async function pkce(): Promise<{ verifier: string; challenge: string }> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: b64url(new Uint8Array(digest)) };
}

// JWT payload 의 한 필드를 읽는다. 검증은 서버가 하므로 여기선 표시용으로만 디코드한다.
function jwtField(token: string, key: string): unknown {
  try {
    const seg = token.split(".")[1];
    if (!seg) return undefined;
    const pad = seg.length % 4 === 0 ? "" : "=".repeat(4 - (seg.length % 4));
    const json = JSON.parse(atob(seg.replace(/-/g, "+").replace(/_/g, "/") + pad)) as Record<string, unknown>;
    return json[key];
  } catch {
    return undefined;
  }
}

function jwtExpMs(token: string): number {
  const exp = jwtField(token, "exp");
  return typeof exp === "number" ? exp * 1000 : 0;
}

function jwtTier(token: string): Tier | null {
  const t = jwtField(token, "tier");
  return t === "paid" ? "paid" : t === "free" ? "free" : null;
}

// 이 환경에서 로그인이 가능한가. 확장 컨텍스트(chrome.identity)와 client_id 구성이 모두 필요하다.
export function isLoginAvailable(): boolean {
  return !!GOOGLE_CLIENT_ID && !!chromeApi()?.identity?.launchWebAuthFlow;
}

export async function isLoggedIn(): Promise<boolean> {
  return (await load()) != null;
}

// Google 로그인. launchWebAuthFlow 로 code 를 받아 Worker 에 교환을 맡기고 JWT 를 저장한다.
export async function signInWithGoogle(): Promise<{ email: string; tier: Tier }> {
  const c = chromeApi();
  if (!GOOGLE_CLIENT_ID || !c?.identity?.launchWebAuthFlow || !c.identity.getRedirectURL) {
    throw new Error("LOGIN_UNAVAILABLE");
  }
  const redirectUri = c.identity.getRedirectURL();
  const { verifier, challenge } = await pkce();
  const authUrl =
    "https://accounts.google.com/o/oauth2/v2/auth?" +
    new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "openid email",
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
  const redirectResp = await new Promise<string>((resolve, reject) => {
    c.identity.launchWebAuthFlow({ url: authUrl, interactive: true }, (resp?: string) => {
      const err = c.runtime?.lastError;
      if (err || !resp) {
        reject(new Error(err?.message ?? "LOGIN_CANCELLED"));
        return;
      }
      resolve(resp);
    });
  });
  const code = new URL(redirectResp).searchParams.get("code");
  if (!code) throw new Error("LOGIN_NO_CODE");
  const res = await fetch(`${WORKER_BASE}/auth/google`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, code_verifier: verifier, redirect_uri: redirectUri }),
  });
  if (!res.ok) throw new Error("LOGIN_EXCHANGE_FAILED");
  const data = (await res.json()) as { access_token: string; refresh_token: string; user: { email: string; tier: Tier } };
  await save({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    email: data.user.email,
    tier: data.user.tier,
    access_exp: jwtExpMs(data.access_token),
  });
  return { email: data.user.email, tier: data.user.tier };
}

// 리프레시 토큰으로 액세스 토큰을 갱신한다. 폐기됐으면 로그아웃 처리하고 null 을 돌려준다.
export async function refresh(): Promise<StoredAuth | null> {
  const cur = await load();
  if (!cur?.refresh_token) return null;
  let res: Response;
  try {
    res = await fetch(`${WORKER_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: cur.refresh_token }),
    });
  } catch {
    return cur; // 네트워크 오류면 기존 토큰을 유지한다(서버가 최종 판정).
  }
  if (!res.ok) {
    await save(null);
    return null;
  }
  const data = (await res.json()) as { access_token: string; refresh_token: string };
  const updated: StoredAuth = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    email: cur.email,
    tier: jwtTier(data.access_token) ?? cur.tier,
    access_exp: jwtExpMs(data.access_token),
  };
  await save(updated);
  return updated;
}

// API 호출에 붙일 액세스 토큰이다. 만료 2분 전이면 먼저 갱신을 시도한다.
export async function getAccessToken(): Promise<string | null> {
  const a = await load();
  if (!a) return null;
  if (Date.now() < a.access_exp - 120_000) return a.access_token;
  const refreshed = await refresh();
  return refreshed?.access_token ?? null;
}

// 현재 플랜이다. 저장된 tier 에서 유도한다.
export async function getPlan(): Promise<Plan> {
  const a = await load();
  return a?.tier === "paid" ? "pro" : "flash";
}

export async function signOut(): Promise<void> {
  const a = await load();
  if (a) {
    try {
      await fetch(`${WORKER_BASE}/auth/logout`, { method: "POST", headers: { Authorization: `Bearer ${a.access_token}` } });
    } catch {
      /* 무시 */
    }
  }
  await save(null);
}
