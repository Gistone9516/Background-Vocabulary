-- 0001_init — 영속 스키마 정본(PostgreSQL). 인터페이스계약-v2 §6 승계.
-- 로컬(Docker PG)과 Aurora가 같은 파일을 사용한다. 생성 순서(FK): users → projects → sessions → assets → knowledge.

CREATE TABLE IF NOT EXISTS users (
  user_id             TEXT PRIMARY KEY,            -- UUIDv7
  email               TEXT NOT NULL UNIQUE,
  google_sub          TEXT UNIQUE,
  locale              TEXT NOT NULL DEFAULT 'ko',  -- FR-952 언어 설정 영속(크로스 플랫폼)
  tier                TEXT NOT NULL DEFAULT 'free',
  subscription_status TEXT NOT NULL DEFAULT 'none',
  expires_at          BIGINT,
  current_period_end  BIGINT,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
  grace_until         BIGINT,
  failed_payment_count INT NOT NULL DEFAULT 0,
  next_retry_at       BIGINT,
  last_failure_code   TEXT,
  current_price       INT,
  currency            TEXT,
  billing_interval    TEXT NOT NULL DEFAULT 'monthly',
  pg_provider         TEXT,
  created_at          BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  project_id TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(user_id),
  name       TEXT NOT NULL,
  created_at BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  session_id     TEXT PRIMARY KEY,
  user_id        TEXT NOT NULL REFERENCES users(user_id),
  topic          TEXT NOT NULL,
  area           TEXT,
  domain_risk    TEXT NOT NULL,
  job_type       JSONB NOT NULL,
  gap_type       JSONB,
  user_condition TEXT,
  context_object TEXT,
  narrow         JSONB,                            -- NarrowSnap. NULL ⟺ 생성 완료
  generated      JSONB,                            -- Term[]
  primer         JSONB,                            -- PrimerDoc 서버 정본
  project_id     TEXT REFERENCES projects(project_id) ON DELETE SET NULL,
  pinned         BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at     BIGINT,                           -- 소프트 삭제(실행취소)
  created_at     BIGINT NOT NULL,
  updated_at     BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS assets (
  asset_id    TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(user_id),
  session_id  TEXT NOT NULL,
  term        JSONB NOT NULL,
  term_norm   TEXT NOT NULL,                       -- 정규화 키(중복 담기 방지·맵 노드 키)
  domain_tags JSONB NOT NULL,
  project_id  TEXT REFERENCES projects(project_id) ON DELETE SET NULL,
  created_at  BIGINT NOT NULL,
  UNIQUE(user_id, session_id, term_norm)
);
CREATE INDEX IF NOT EXISTS idx_assets_user_project ON assets(user_id, project_id);

CREATE TABLE IF NOT EXISTS knowledge (
  user_id    TEXT NOT NULL REFERENCES users(user_id),
  term_norm  TEXT NOT NULL,
  tag        TEXT NOT NULL,
  updated_at BIGINT NOT NULL,
  PRIMARY KEY(user_id, term_norm)
);
