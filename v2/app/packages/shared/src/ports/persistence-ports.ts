// 영속 포트(SqlRunner + 리포지토리). 구현은 adapters/persistence(드라이버 무관, SqlRunner 의존).
// 드라이버(node-postgres=local, Data API=aws)는 SqlRunner 뒤에 감추고 리포는 한 벌만 작성한다(DRY).

import type {
  SessionRec,
  AssetTerm,
  KnowledgeState,
  Project,
  Page,
  SessionSummary,
  AssetSummary,
  ListSessionsQuery,
} from "../types/index.js";

// SQL 실행 추상화. 파라미터는 PostgreSQL 위치 바인딩($1, $2, …) 규약을 쓴다.
// transaction()은 짧게만(Data API 3분 상한). 중첩 트랜잭션은 만들지 않는다(평탄 실행).
export interface SqlRunner {
  query<T = Record<string, unknown>>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  execute(sql: string, params?: readonly unknown[]): Promise<{ rowCount: number }>;
  transaction<T>(fn: (tx: SqlRunner) => Promise<T>): Promise<T>;
}

// 세션 소유권 위반(횡령 방지, §3-3). 라우트가 409로 매핑한다.
export class OwnershipError extends Error {
  constructor(public readonly resourceId: string) {
    super(`소유권 위반: ${resourceId}`);
    this.name = "OwnershipError";
  }
}

export interface SessionRepository {
  get(userId: string, sessionId: string): Promise<SessionRec | null>;
  // 멱등 upsert. 대상이 타 user_id 소유면 OwnershipError를 던진다.
  upsert(rec: SessionRec): Promise<SessionRec>;
  list(q: ListSessionsQuery): Promise<Page<SessionSummary>>;
  softDelete(userId: string, sessionId: string, deletedAt: number): Promise<boolean>;
  // 유예 시각(graceUntil) 이내 삭제만 복구. 경과/부재면 false.
  restore(userId: string, sessionId: string, graceUntil: number): Promise<boolean>;
}

export interface AssetRepository {
  listByProject(userId: string, projectId: string | null, cursor?: string | null, limit?: number): Promise<Page<AssetSummary>>;
  get(userId: string, assetId: string): Promise<AssetTerm | null>;
  keep(asset: AssetTerm): Promise<AssetTerm>; // UNIQUE(user,session,term_norm) 멱등
  unkeep(userId: string, sessionId: string, termNorm: string): Promise<boolean>;
  // FR-706 dedup 입력: 프로젝트 자산의 term_norm 목록(서버가 exclude에 병합).
  termNormsByProject(userId: string, projectId: string): Promise<string[]>;
}

export interface KnowledgeRepository {
  upsertBatch(states: KnowledgeState[]): Promise<void>;
  listByUser(userId: string): Promise<KnowledgeState[]>;
}

export interface ProjectRepository {
  list(userId: string): Promise<Project[]>;
  create(p: Project): Promise<Project>;
  // 세션·자산의 소속만 해제(FK ON DELETE SET NULL), 세션 자체는 보존.
  delete(userId: string, projectId: string): Promise<boolean>;
}

// 부트가 조립해 주입하는 리포 묶음.
export interface Repositories {
  sessions: SessionRepository;
  assets: AssetRepository;
  knowledge: KnowledgeRepository;
  projects: ProjectRepository;
}
