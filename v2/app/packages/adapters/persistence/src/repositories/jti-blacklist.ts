// refresh jti 블랙리스트의 PG 구현(§11 Aurora 테이블 결정). 만료행은 검증에서 무시한다.

import type { SqlRunner, JtiBlacklist } from "@vock/shared";

export class PgJtiBlacklist implements JtiBlacklist {
  constructor(private readonly sql: SqlRunner) {}

  async isRevoked(jti: string): Promise<boolean> {
    // 아직 만료되지 않은 취소 기록만 유효(경과행은 무시 — refresh 자체도 exp로 이미 거부됨).
    const rows = await this.sql.query<{ jti: string }>("SELECT jti FROM revoked_jtis WHERE jti = $1 AND expires_at > $2", [jti, Date.now()]);
    return rows.length > 0;
  }

  async revoke(jti: string, expiresAtMs: number): Promise<void> {
    await this.sql.execute("INSERT INTO revoked_jtis (jti, expires_at) VALUES ($1,$2) ON CONFLICT (jti) DO NOTHING", [jti, expiresAtMs]);
  }
}
