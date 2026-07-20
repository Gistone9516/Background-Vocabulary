-- 0002_auth — refresh 토큰 블랙리스트(§11 재결정: Aurora 테이블). users는 0001에 존재.
-- expires_at 경과 행은 검증 시 무시하고, 주기 청소는 C2.5(EventBridge) 후보.

CREATE TABLE IF NOT EXISTS revoked_jtis (
  jti        TEXT PRIMARY KEY,
  expires_at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_revoked_jtis_exp ON revoked_jtis(expires_at);
