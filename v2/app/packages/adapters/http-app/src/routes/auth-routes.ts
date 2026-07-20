// 인증 라우트(SoT §3-2). 오케스트레이션은 core AuthService, 여기는 HTTP 매핑·에러코드만(v1 §8 승계).

import type { Hono } from "hono";
import type { AuthService } from "@vock/core";
import { bearer } from "../middleware/auth.js";

type Body = Record<string, unknown>;

export function registerAuthRoutes(app: Hono, auth: AuthService): void {
  // POST /auth/google — PKCE 코드 교환 → 계정 조회/생성 → 토큰 발급.
  app.post("/auth/google", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Body;
    const code = body.code as string | undefined;
    const codeVerifier = body.code_verifier as string | undefined;
    const redirectUri = body.redirect_uri as string | undefined;
    const platform = body.platform === "desktop" ? "desktop" : "web";
    if (!code || !codeVerifier || !redirectUri) {
      return c.json({ error: "AUTH_FAILED", message: "인증 요청이 올바르지 않습니다." }, 401);
    }
    try {
      const { tokens, user } = await auth.loginWithGoogle({ code, codeVerifier, redirectUri, platform });
      return c.json({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_in: tokens.expires_in, user });
    } catch (err) {
      console.error("Google 코드 교환 실패:", err);
      return c.json({ error: "AUTH_FAILED", message: "Google 로그인에 실패했습니다. 다시 시도해 주세요." }, 401);
    }
  });

  // POST /auth/refresh — 블랙리스트 검사 + DB 최신 tier 재조회 후 재발급.
  app.post("/auth/refresh", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Body;
    const refreshToken = body.refresh_token as string | undefined;
    if (!refreshToken) return c.json({ error: "TOKEN_REVOKED", message: "다시 로그인해 주세요." }, 401);
    const tokens = await auth.refresh(refreshToken);
    if (!tokens) return c.json({ error: "TOKEN_REVOKED", message: "세션이 만료되었습니다. 다시 로그인해 주세요." }, 401);
    return c.json({ access_token: tokens.access_token, refresh_token: tokens.refresh_token, expires_in: tokens.expires_in });
  });

  // POST /auth/logout — refresh jti 블랙리스트 등록(멱등).
  app.post("/auth/logout", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as Body;
    const refreshToken = body.refresh_token as string | undefined;
    if (refreshToken) await auth.logout(refreshToken);
    return c.body(null, 204);
  });

  // GET /subscription/status — 최신 엔타이틀먼트 + 새 액세스 토큰.
  app.get("/subscription/status", async (c) => {
    const token = bearer(c);
    if (!token) return c.json({ error: "AUTH_REQUIRED", message: "로그인이 필요합니다." }, 401);
    const result = await auth.status(token);
    if (!result) return c.json({ error: "TOKEN_EXPIRED", message: "세션이 만료되었습니다. 다시 로그인해 주세요." }, 401);
    return c.json(result);
  });
}
