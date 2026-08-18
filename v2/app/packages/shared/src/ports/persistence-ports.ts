// 영속 포트(SqlRunner + 리포지토리). 구현은 adapters/persistence(드라이버 무관, SqlRunner 의존).
// 드라이버(node-postgres=local, Data API=aws)는 SqlRunner 뒤에 감추고 리포는 한 벌만 작성한다(DRY).

import type {
  SessionRec,
  AssetTerm,
  DetailRec,
  DetailSummary,
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
  // 세션 스코프 담은 어휘 전체(스펙 V-18). 재개 시 담기 복원과 재진입 카드의 개수가 이 하나를 공유한다.
  // 요약이 아니라 AssetTerm인 이유: 화면의 KeptMap이 Term 전체를 들고 있어야 카드가 그려진다.
  // 세션당 담기 상한이 무료 8·유료 32라 커서를 두지 않는다 — 목록 길이가 곧 담은 개수다.
  listBySession(userId: string, sessionId: string): Promise<AssetTerm[]>;
}

// 펼친 상세의 읽기-통과 캐시(FR-401)이자 조회 기록.
export interface DetailRepository {
  // 판정은 input_key만 본다(E-3). term_norm으로 찾지 않는다.
  find(userId: string, inputKey: string): Promise<DetailRec | null>;
  // 성공 응답만 저장한다(E-6). 같은 키 재저장은 멱등.
  save(rec: DetailRec): Promise<void>;
  // 종착 화면 우측 패널의 스코프 1(C5-S2 T-8). body는 뽑지 않는다.
  listBySession(userId: string, sessionId: string): Promise<DetailSummary[]>;
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
  details: DetailRepository;
  projects: ProjectRepository;
}
