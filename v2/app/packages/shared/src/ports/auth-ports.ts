// 인증 포트. 구현은 adapters(persistence=UserRepository·JtiBlacklist, providers=GoogleOAuthClient).
// core/auth 서비스는 이 포트에만 의존한다.

import type { UserRecord, NewUser, EntitlementPatch } from "../types/index.js";

// 엔타이틀먼트 저장소. 구현은 PG(persistence), 후일 DynamoDB 등 교체 가능.
export interface UserRepository {
  findById(userId: string): Promise<UserRecord | null>;
  findByEmail(email: string): Promise<UserRecord | null>;
  findByGoogleSub(sub: string): Promise<UserRecord | null>;
  create(rec: NewUser): Promise<UserRecord>;
  applyEntitlement(patch: EntitlementPatch): Promise<UserRecord>; // 멱등 upsert
}

// Google에서 검증한 신원(id_token 클레임 부분집합).
export interface GoogleIdentity {
  sub: string;
  email: string;
  email_verified: boolean;
}

// Google OAuth 코드 교환. 구현은 provider 어댑터(실 Google) 또는 목(local 테스트).
// platform으로 web/desktop client_id·secret 쌍을 선택한다(§3-2).
export interface GoogleOAuthClient {
  exchange(args: { code: string; codeVerifier: string; redirectUri: string; platform: "web" | "desktop" }): Promise<GoogleIdentity>;
}

// refresh jti 블랙리스트(취소·로그아웃). 구현 = Aurora 테이블(§11 재결정). access는 networkless라 조회 안 함.
export interface JtiBlacklist {
  isRevoked(jti: string): Promise<boolean>;
  revoke(jti: string, expiresAtMs: number): Promise<void>;
}

// 인증 서비스 구성(부트가 env에서 주입). 시크릿은 절대 클라 노출 금지.
export interface AuthConfig {
  jwtSecretCurrent: string;
  jwtSecretPrev?: string; // 키 로테이션 시 이전 키(이중 검증)
  jwtKid: string;
  devForceTier?: "free" | "paid"; // DEV_MODE 전용 override(로컬)
}
