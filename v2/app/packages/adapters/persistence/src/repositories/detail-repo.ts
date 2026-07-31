// 펼친 상세 캐시 리포(FR-401). 행의 존재가 곧 "그 어휘를 조회했다"는 기록이다.
// 조회 판정은 input_key만 본다(E-3) — term_norm은 표시·목록용이라 조회 조건이 아니다.

import type { SqlRunner, DetailRepository, DetailRec, Prompt5Out } from "@vock/shared";
import { asJson, toJsonParam, asNum } from "../json.js";

type Row = Record<string, unknown>;

export class DetailRepositoryImpl implements DetailRepository {
  constructor(private readonly sql: SqlRunner) {}

  async find(userId: string, inputKey: string): Promise<DetailRec | null> {
    // user_id를 조건에 넣는 것이 소유권 경계다(E-4). 키만으로 찾으면 남의 내 맥락이 나온다.
    const rows = await this.sql.query<Row>(
      "SELECT user_id, session_id, term_norm, input_key, body, created_at FROM details WHERE user_id = $1 AND input_key = $2",
      [userId, inputKey],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      user_id: r.user_id as string,
      session_id: r.session_id as string,
      term_norm: r.term_norm as string,
      input_key: r.input_key as string,
      body: asJson<Prompt5Out>(r.body),
      created_at: asNum(r.created_at),
    };
  }

  async save(rec: DetailRec): Promise<void> {
    // 같은 키는 같은 입력이므로 같은 생성이다. 덮어쓰지 않는 이유는 created_at을
    // "처음 조회한 시각"으로 남기기 위해서다 — 덮어쓰면 매번 지금이 되어 기록으로서 값이 없어진다.
    await this.sql.execute(
      `INSERT INTO details (user_id, session_id, term_norm, input_key, body, created_at) VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (user_id, input_key) DO NOTHING`,
      [rec.user_id, rec.session_id, rec.term_norm, rec.input_key, toJsonParam(rec.body), rec.created_at],
    );
  }
}
