// 지식 상태 리포. 태깅 변경 배치 upsert.

import type { SqlRunner, KnowledgeRepository, KnowledgeState, Tag } from "@vock/shared";
import { asNum } from "../json.js";

type Row = Record<string, unknown>;

export class KnowledgeRepositoryImpl implements KnowledgeRepository {
  constructor(private readonly sql: SqlRunner) {}

  async upsertBatch(states: KnowledgeState[]): Promise<void> {
    if (states.length === 0) return;
    await this.sql.transaction(async (tx) => {
      for (const s of states) {
        await tx.execute(
          `INSERT INTO knowledge (user_id, term_norm, tag, updated_at) VALUES ($1,$2,$3,$4)
           ON CONFLICT (user_id, term_norm) DO UPDATE SET tag = EXCLUDED.tag, updated_at = EXCLUDED.updated_at`,
          [s.user_id, s.term_norm, s.tag, s.updated_at],
        );
      }
    });
  }

  async listByUser(userId: string): Promise<KnowledgeState[]> {
    const rows = await this.sql.query<Row>("SELECT user_id, term_norm, tag, updated_at FROM knowledge WHERE user_id = $1", [userId]);
    return rows.map((r) => ({
      user_id: r.user_id as string,
      term_norm: r.term_norm as string,
      tag: r.tag as Tag,
      updated_at: asNum(r.updated_at),
    }));
  }
}
