// 세션 리포. SqlRunner에만 의존(드라이버 무관). SQL·직렬화는 이 경계 밖으로 새지 않는다.

import type {
  SqlRunner,
  SessionRepository,
  SessionRec,
  NarrowSnap,
  PrimerDoc,
  Term,
  JobType,
  GapType,
  DomainRisk,
  Page,
  SessionSummary,
  ListSessionsQuery,
} from "@vock/shared";
import { OwnershipError } from "@vock/shared";
import { asJson, asJsonOrNull, toJsonParam, asNum, asNumOrNull } from "../json.js";
import { encodeCursor, decodeCursor } from "../cursor.js";

type Row = Record<string, unknown>;

function toRec(r: Row): SessionRec {
  return {
    session_id: r.session_id as string,
    user_id: r.user_id as string,
    topic: r.topic as string,
    area: (r.area as string | null) ?? null,
    domain_risk: r.domain_risk as DomainRisk,
    job_type: asJson<JobType[]>(r.job_type),
    gap_type: asJsonOrNull<GapType[]>(r.gap_type),
    user_condition: (r.user_condition as string | null) ?? null,
    context_object: (r.context_object as string | null) ?? null,
    narrow: asJsonOrNull<NarrowSnap>(r.narrow),
    generated: asJsonOrNull<Term[]>(r.generated),
    primer: asJsonOrNull<PrimerDoc>(r.primer),
    project_id: (r.project_id as string | null) ?? null,
    pinned: r.pinned as boolean,
    deleted_at: asNumOrNull(r.deleted_at),
    created_at: asNum(r.created_at),
    updated_at: asNum(r.updated_at),
  };
}

function toSummary(r: Row): SessionSummary {
  return {
    session_id: r.session_id as string,
    topic: r.topic as string,
    area: (r.area as string | null) ?? null,
    domain_risk: r.domain_risk as DomainRisk,
    project_id: (r.project_id as string | null) ?? null,
    pinned: r.pinned as boolean,
    generating: r.generating as boolean,
    created_at: asNum(r.created_at),
    updated_at: asNum(r.updated_at),
  };
}

const COLS = "session_id, user_id, topic, area, domain_risk, job_type, gap_type, user_condition, context_object, narrow, generated, primer, project_id, pinned, deleted_at, created_at, updated_at";

export class SessionRepositoryImpl implements SessionRepository {
  constructor(private readonly sql: SqlRunner) {}

  async get(userId: string, sessionId: string): Promise<SessionRec | null> {
    const rows = await this.sql.query<Row>(`SELECT ${COLS} FROM sessions WHERE session_id = $1 AND user_id = $2 AND deleted_at IS NULL`, [sessionId, userId]);
    return rows[0] ? toRec(rows[0]) : null;
  }

  async upsert(rec: SessionRec): Promise<SessionRec> {
    return this.sql.transaction(async (tx) => {
      const owner = await tx.query<{ user_id: string }>("SELECT user_id FROM sessions WHERE session_id = $1", [rec.session_id]);
      if (owner[0] && owner[0].user_id !== rec.user_id) throw new OwnershipError(rec.session_id);
      await tx.execute(
        `INSERT INTO sessions (${COLS})
         VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10::jsonb,$11::jsonb,$12::jsonb,$13,$14,$15,$16,$17)
         ON CONFLICT (session_id) DO UPDATE SET
           topic=EXCLUDED.topic, area=EXCLUDED.area, domain_risk=EXCLUDED.domain_risk,
           job_type=EXCLUDED.job_type, gap_type=EXCLUDED.gap_type,
           user_condition=EXCLUDED.user_condition, context_object=EXCLUDED.context_object,
           narrow=EXCLUDED.narrow, generated=EXCLUDED.generated, primer=EXCLUDED.primer,
           project_id=EXCLUDED.project_id, pinned=EXCLUDED.pinned, deleted_at=EXCLUDED.deleted_at,
           updated_at=EXCLUDED.updated_at`,
        [
          rec.session_id, rec.user_id, rec.topic, rec.area, rec.domain_risk,
          toJsonParam(rec.job_type), rec.gap_type == null ? null : toJsonParam(rec.gap_type),
          rec.user_condition, rec.context_object,
          rec.narrow == null ? null : toJsonParam(rec.narrow),
          rec.generated == null ? null : toJsonParam(rec.generated),
          rec.primer == null ? null : toJsonParam(rec.primer),
          rec.project_id, rec.pinned, rec.deleted_at, rec.created_at, rec.updated_at,
        ],
      );
      const rows = await tx.query<Row>(`SELECT ${COLS} FROM sessions WHERE session_id = $1`, [rec.session_id]);
      return toRec(rows[0]!);
    });
  }

  async list(q: ListSessionsQuery): Promise<Page<SessionSummary>> {
    const limit = Math.min(q.limit ?? 20, 50);
    const params: unknown[] = [q.userId];
    let where = "user_id = $1 AND deleted_at IS NULL";
    if (q.projectId !== undefined && q.projectId !== null) { params.push(q.projectId); where += ` AND project_id = $${params.length}`; }
    if (q.pinned !== undefined) { params.push(q.pinned); where += ` AND pinned = $${params.length}`; }
    if (q.q) { params.push(`%${q.q}%`); where += ` AND topic ILIKE $${params.length}`; }
    const cur = decodeCursor(q.cursor);
    if (cur) {
      params.push(cur.sortValue); const pS = params.length;
      params.push(cur.id); const pI = params.length;
      where += ` AND (updated_at < $${pS} OR (updated_at = $${pS} AND session_id < $${pI}))`;
    }
    params.push(limit + 1);
    const rows = await this.sql.query<Row>(
      `SELECT session_id, topic, area, domain_risk, project_id, pinned, (narrow IS NOT NULL) AS generating, created_at, updated_at
       FROM sessions WHERE ${where} ORDER BY updated_at DESC, session_id DESC LIMIT $${params.length}`,
      params,
    );
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(toSummary);
    const last = items[items.length - 1];
    return { items, nextCursor: hasMore && last ? encodeCursor(last.updated_at, last.session_id) : null };
  }

  async softDelete(userId: string, sessionId: string, deletedAt: number): Promise<boolean> {
    const r = await this.sql.execute("UPDATE sessions SET deleted_at = $3, updated_at = $3 WHERE session_id = $1 AND user_id = $2 AND deleted_at IS NULL", [sessionId, userId, deletedAt]);
    return r.rowCount > 0;
  }

  async restore(userId: string, sessionId: string, graceUntil: number): Promise<boolean> {
    // deleted_at >= graceUntil 이면 유예 내 → 복구. 경과/부재면 0행. updated_at은 삭제 시점 값 유지.
    const r = await this.sql.execute("UPDATE sessions SET deleted_at = NULL WHERE session_id = $1 AND user_id = $2 AND deleted_at IS NOT NULL AND deleted_at >= $3", [sessionId, userId, graceUntil]);
    return r.rowCount > 0;
  }
}
