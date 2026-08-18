-- domain_tags 백필(C5-S3b G-5). 스키마 변경은 없다 — 채우는 주체만 서버로 옮겼고,
-- 그 전에 담긴 행이 전부 비어 있어서 교차분야 연결(FR-312·Q-02)에 재료가 없었다.
--
-- 이 마이그레이션 이전의 모든 자산은 domain_tags 가 '[]' 다. 서버가 요청 바디에서 받았는데
-- 그 값을 보내는 클라이언트 코드가 없었기 때문이다(소비처는 있고 생산자가 없던 필드).
--
-- 이미 채워진 행은 건드리지 않는다. 재실행해도 결과가 같다(멱등).
-- area 가 없는 세션의 자산은 비운 채로 둔다 — topic 으로 대체하면 같은 분야를 다르게 적은
-- 두 세션이 다른 태그를 갖게 되어 연결이 오히려 끊긴다(G-3).
UPDATE assets a
   SET domain_tags = to_jsonb(ARRAY[s.area])
  FROM sessions s
 WHERE a.session_id = s.session_id
   AND a.user_id    = s.user_id
   AND s.area IS NOT NULL
   AND s.area <> ''
   AND a.domain_tags = '[]'::jsonb;
