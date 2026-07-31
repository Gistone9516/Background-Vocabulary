-- 펼친 상세 본문 캐시(FR-401 "한 번 연 내용은 캐시").
-- 행의 존재 자체가 "조회했다"는 기록이라 조회 플래그를 따로 두지 않는다(E-2).
-- PK가 (user_id, input_key)인 이유는 캐시 판정이 input_key만 보기 때문이다(E-3).
-- term_norm은 표시·목록용 색인이지 조회 조건이 아니다.
CREATE TABLE IF NOT EXISTS details (
  user_id    TEXT NOT NULL REFERENCES users(user_id),
  session_id TEXT NOT NULL,
  term_norm  TEXT NOT NULL,
  input_key  TEXT NOT NULL,
  body       JSONB NOT NULL,
  created_at BIGINT NOT NULL,
  PRIMARY KEY(user_id, input_key)
);

-- 세션 스코프 목록(우측 패널)이 읽을 색인. 목록은 body를 뽑지 않는다(E-8).
CREATE INDEX IF NOT EXISTS idx_details_user_session ON details(user_id, session_id);

-- 지식 상태(알아/몰라/적용모름) 폐기. 컬럼만 남기지 않고 테이블째 내린다(E-12) —
-- tag는 CHECK 없는 TEXT라 남겨 두면 어떤 게이트도 옛 값이 다시 들어오는 것을 막지 못한다.
DROP TABLE IF EXISTS knowledge;
