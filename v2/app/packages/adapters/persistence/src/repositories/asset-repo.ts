// 어휘 자산 리포. 목록은 term 대형 JSONB 대신 표시 필드만 뽑아 1MB 상한을 피한다(§6).

import type { SqlRunner, AssetRepository, AssetTerm, Term, Page, AssetSummary } from "@vock/shared";
import { asJson, toJsonParam, asNum } from "../json.js";
import { encodeCursor, decodeCursor } from "../cursor.js";

type Row = Record<string, unknown>;

function toAsset(r: Row): AssetTerm {
  return {
    asset_id: r.asset_id as string,
    user_id: r.user_id as string,
    session_id: r.session_id as string,
    term: asJson<Term>(r.term),
    term_norm: r.term_norm as string,
    domain_tags: asJson<string[]>(r.domain_tags),
    project_id: (r.project_id as string | null) ?? null,
    created_at: asNum(r.created_at),
  };
}

function toSummary(r: Row): AssetSummary {
  return {
    asset_id: r.asset_id as string,
    session_id: r.session_id as string,
    term_norm: r.term_norm as string,
    term_name: (r.term_name as string | null) ?? "",
    one_line: (r.one_line as string | null) ?? "",
    kind: (r.kind as string | null) ?? "",
    domain_tags: asJson<string[]>(r.domain_tags),
    project_id: (r.project_id as string | null) ?? null,
    created_at: asNum(r.created_at),
  };
}

export class AssetRepositoryImpl implements AssetRepository {
  constructor(private readonly sql: SqlRunner) {}

  async listByProject(userId: string, projectId: string | null, cursor?: string | null, limit = 30): Promise<Page<AssetSummary>> {
    const lim = Math.min(limit, 100);
    const params: unknown[] = [userId];
    let where = "user_id = $1";
    if (projectId !== null && projectId !== undefined) { params.push(projectId); where += ` AND project_id = $${params.length}`; }
    const cur = decodeCursor(cursor);
    if (cur) {
      params.push(cur.sortValue); const pS = params.length;
      params.push(cur.id); const pI = params.length;
      where += ` AND (created_at < $${pS} OR (created_at = $${pS} AND asset_id < $${pI}))`;
    }
    params.push(lim + 1);
    const rows = await this.sql.query<Row>(
      `SELECT asset_id, session_id, term_norm, term->>'term' AS term_name, term->>'one_line' AS one_line, term->>'kind' AS kind, domain_tags, project_id, created_at
       FROM assets WHERE ${where} ORDER BY created_at DESC, asset_id DESC LIMIT $${params.length}`,
      params,
    );
    const hasMore = rows.length > lim;
    const items = rows.slice(0, lim).map(toSummary);
    const last = items[items.length - 1];
    return { items, nextCursor: hasMore && last ? encodeCursor(last.created_at, last.asset_id) : null };
  }

  async get(userId: string, assetId: string): Promise<AssetTerm | null> {
    const rows = await this.sql.query<Row>("SELECT asset_id, user_id, session_id, term, term_norm, domain_tags, project_id, created_at FROM assets WHERE asset_id = $1 AND user_id = $2", [assetId, userId]);
    return rows[0] ? toAsset(rows[0]) : null;
  }

  async keep(a: AssetTerm): Promise<AssetTerm> {
    const rows = await this.sql.query<Row>(
      `INSERT INTO assets (asset_id, user_id, session_id, term, term_norm, domain_tags, project_id, created_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6::jsonb,$7,$8)
       ON CONFLICT (user_id, session_id, term_norm) DO UPDATE SET
         term=EXCLUDED.term, domain_tags=EXCLUDED.domain_tags, project_id=EXCLUDED.project_id
       RETURNING asset_id, user_id, session_id, term, term_norm, domain_tags, project_id, created_at`,
      [a.asset_id, a.user_id, a.session_id, toJsonParam(a.term), a.term_norm, toJsonParam(a.domain_tags), a.project_id, a.created_at],
    );
    return toAsset(rows[0]!);
  }

  async unkeep(userId: string, sessionId: string, termNorm: string): Promise<boolean> {
    const r = await this.sql.execute("DELETE FROM assets WHERE user_id = $1 AND session_id = $2 AND term_norm = $3", [userId, sessionId, termNorm]);
    return r.rowCount > 0;
  }

  async termNormsByProject(userId: string, projectId: string): Promise<string[]> {
    const rows = await this.sql.query<{ term_norm: string }>("SELECT DISTINCT term_norm FROM assets WHERE user_id = $1 AND project_id = $2", [userId, projectId]);
    return rows.map((r) => r.term_norm);
  }
}
