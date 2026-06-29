-- Phase 0 엔타이틀먼트 SoT 스키마. 정본 계약은 인터페이스계약 8장이다.
-- dunning 과 Cron 관련 컬럼을 처음부터 전부 둔다. 후일 추가 마이그레이션을 0으로 만들려는 의도다.
-- Phase 0 에서 실제로 채우는 것은 users 와 consents 뿐이고 나머지는 Phase 1 에서 채운다.
-- 시각은 전부 epoch 밀리초 정수로 저장한다. SQLite 는 boolean 을 0 또는 1 정수로 둔다.

CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  google_sub TEXT UNIQUE,
  tier TEXT NOT NULL DEFAULT 'free',
  subscription_status TEXT NOT NULL DEFAULT 'none',
  expires_at INTEGER,
  current_period_end INTEGER,
  cancel_at_period_end INTEGER NOT NULL DEFAULT 0,
  grace_until INTEGER,
  failed_payment_count INTEGER NOT NULL DEFAULT 0,
  next_retry_at INTEGER,
  last_failure_code TEXT,
  current_price INTEGER,
  currency TEXT,
  billing_interval TEXT NOT NULL DEFAULT 'monthly',
  pg_provider TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS payment_events (
  event_id TEXT PRIMARY KEY,
  cycle_key TEXT UNIQUE,
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  occurred_at INTEGER NOT NULL,
  currency TEXT,
  amount_minor INTEGER,
  consumer_country TEXT,
  pg_provider TEXT,
  raw TEXT
);

CREATE TABLE IF NOT EXISTS billing_locks (
  lock_key TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS notification_log (
  notif_key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  sent_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS consents (
  consent_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  ip TEXT,
  ua TEXT,
  ts INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_events_user ON payment_events(user_id);
CREATE INDEX IF NOT EXISTS idx_consents_user ON consents(user_id);
