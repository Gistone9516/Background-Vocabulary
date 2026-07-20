// 인증 오케스트레이션(순수 로직). 주입된 포트(UserRepository·GoogleOAuthClient·JtiBlacklist)만 호출한다.
// v1 /auth 라우트 오케스트레이션 이식 — 런타임(Hono/D1)을 걷어내고 포트로 대체.

import type { UserRepository, GoogleOAuthClient, JtiBlacklist, AuthConfig, AccessTokenClaims, Tier } from "@vock/shared";
import { issueTokens, verifyAccess, verifyRefresh, type IssuedTokens } from "./jwt.js";
import { effectiveEntitlement } from "./entitlement.js";

export interface AuthServiceDeps {
  users: UserRepository;
  google: GoogleOAuthClient;
  blacklist: JtiBlacklist;
  config: AuthConfig;
}

export interface LoginResult {
  tokens: IssuedTokens;
  user: { email: string; tier: Tier };
}

export interface StatusResult {
  tier: Tier;
  subscription_status: string;
  expires_at: number | null;
  access_token: string;
}

export interface AuthService {
  // Google 코드 교환 → 계정 조회/생성 → 토큰 발급. 교환 실패 시 throw(라우트가 401 매핑).
  loginWithGoogle(args: { code: string; codeVerifier: string; redirectUri: string; platform: "web" | "desktop" }): Promise<LoginResult>;
  // 리프레시 → 블랙리스트 검사 → DB 최신 tier 재조회 → 재발급. 무효면 null(TOKEN_REVOKED).
  refresh(refreshToken: string): Promise<IssuedTokens | null>;
  // 리프레시 jti를 블랙리스트에 등록(멱등). 무효 토큰이면 무동작.
  logout(refreshToken: string): Promise<void>;
  // 액세스 → DB 재조회 → 최신 엔타이틀먼트 + 새 액세스 토큰. 무효면 null.
  status(accessToken: string): Promise<StatusResult | null>;
  // 요청 유효 티어(networkless). DEV override → Bearer 검증 → free 폴백.
  resolveTier(bearerToken: string | null): Promise<Tier>;
  // requireAuth 미들웨어용. 유효한 액세스 클레임이거나 null.
  verifyAccessToken(token: string): Promise<AccessTokenClaims | null>;
}

export function createAuthService(deps: AuthServiceDeps): AuthService {
  const { users, google, blacklist, config } = deps;
  const secrets = (): string[] => [config.jwtSecretCurrent, config.jwtSecretPrev].filter((s): s is string => !!s);
  const issue = (u: { user_id: string; email: string }, tier: Tier): Promise<IssuedTokens> =>
    issueTokens({ userId: u.user_id, tier, email: u.email }, config.jwtSecretCurrent, config.jwtKid);

  return {
    async loginWithGoogle(args) {
      const identity = await google.exchange(args);
      let user = await users.findByEmail(identity.email);
      if (!user) user = await users.create({ email: identity.email, google_sub: identity.sub });
      const ent = effectiveEntitlement(user);
      const tokens = await issue(user, ent.effective_tier);
      return { tokens, user: { email: user.email, tier: ent.effective_tier } };
    },

    async refresh(refreshToken) {
      const claims = await verifyRefresh(refreshToken, secrets());
      if (!claims) return null;
      if (await blacklist.isRevoked(claims.jti)) return null;
      const user = await users.findById(claims.sub);
      if (!user) return null;
      const ent = effectiveEntitlement(user);
      return issue(user, ent.effective_tier);
    },

    async logout(refreshToken) {
      const claims = await verifyRefresh(refreshToken, secrets());
      if (claims) await blacklist.revoke(claims.jti, claims.exp * 1000);
    },

    async status(accessToken) {
      const claims = await verifyAccess(accessToken, secrets());
      if (!claims) return null;
      const user = await users.findById(claims.sub);
      if (!user) return null;
      const ent = effectiveEntitlement(user);
      const tokens = await issue(user, ent.effective_tier);
      return { tier: ent.effective_tier, subscription_status: ent.subscription_status, expires_at: ent.expires_at, access_token: tokens.access_token };
    },

    async resolveTier(bearerToken) {
      if (config.devForceTier) return config.devForceTier;
      if (!bearerToken) return "free";
      const list = secrets();
      if (list.length === 0) return "free";
      const claims = await verifyAccess(bearerToken, list);
      return claims ? claims.tier : "free";
    },

    async verifyAccessToken(token) {
      return verifyAccess(token, secrets());
    },
  };
}
