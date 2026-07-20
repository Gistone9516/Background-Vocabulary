// core/auth 배럴. 순수 인증 로직(JWT·엔타이틀먼트·서비스 오케스트레이션).
export { createAuthService } from "./auth-service.js";
export type { AuthService, AuthServiceDeps, LoginResult, StatusResult } from "./auth-service.js";
export { effectiveEntitlement } from "./entitlement.js";
export { issueTokens, verifyAccess, verifyRefresh } from "./jwt.js";
export type { IssuedTokens } from "./jwt.js";
