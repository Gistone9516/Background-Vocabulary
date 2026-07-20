// 인증 미들웨어 헬퍼. Bearer 추출 + CRUD user_id 리졸버(JWT sub 또는 DEV x-user-id).

import type { AuthService } from "@vock/core";

type Ctx = { req: { header(name: string): string | undefined } };

export function bearer(c: Ctx): string | null {
  const h = c.req.header("authorization") ?? c.req.header("Authorization") ?? "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  const tok = m?.[1];
  return tok ? tok.trim() : null;
}

export type ResolveUserId = (c: Ctx) => Promise<string | null>;

// 인증 구성됨: Bearer 액세스 토큰의 sub를 user_id로. 유효하지 않으면 null(라우트가 401).
export function jwtResolveUserId(auth: AuthService): ResolveUserId {
  return async (c) => {
    const token = bearer(c);
    if (!token) return null;
    const claims = await auth.verifyAccessToken(token);
    return claims?.sub ?? null;
  };
}

// 인증 미구성(DEV): x-user-id 헤더 수용. C2.2 이후 프로덕션 경로에서는 쓰이지 않는다.
export function devResolveUserId(): ResolveUserId {
  return async (c) => {
    const h = c.req.header("x-user-id");
    return h && h.length ? h : null;
  };
}
