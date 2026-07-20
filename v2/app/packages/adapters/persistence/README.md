# @vock/persistence

영속 계층 어댑터 — PG 스키마·마이그레이션·리포지토리. **드라이버 무관**: `SqlRunner` 포트에만 의존해 리포를 한 벌만 작성한다. 드라이버 구현(local=node-postgres, aws=Data API)은 부트가 주입한다. `@vock/shared`에만 의존.

## 구조
```
migrations/
└ 0001_init.sql        영속 스키마 정본(§6, FK 순서 users→projects→sessions→assets→knowledge)
src/
├ index.ts             공개 배럴(migrate·buildRepositories·*Impl)
├ migrate.ts           순번 마이그레이션 러너(SqlRunner 경유, 다중문장 DDL=단순 프로토콜)
├ json.ts              jsonb 경계 헬퍼(파싱·직렬화·BIGINT→number)
├ cursor.ts            keyset 커서 인코딩(1MB 상한 대응)
└ repositories/
   ├ session-repo.ts   소유권 409·keyset 목록·소프트삭제·restore
   ├ asset-repo.ts     담기(멱등)·목록(요약 필드만)·term_norm dedup 입력
   ├ knowledge-repo.ts 태깅 배치 upsert
   ├ project-repo.ts   CRUD(삭제는 FK로 세션 소속만 해제)
   └ index.ts          buildRepositories(sql) 팩토리
```

## 계약·제약
- SQL 파라미터 = PostgreSQL 위치 바인딩(`$1`). jsonb 쓰기 = `$n::jsonb` + 문자열 직렬화, 읽기 = 파싱-if-문자열(드라이버 차이 흡수).
- 목록은 전부 커서 페이지네이션, 대형 JSONB(term·narrow·generated)는 목록 응답에서 제외(단건 조회로만) — Data API 1MB 상한.
- `transaction()`은 짧게(Data API 3분 상한). 중첩 트랜잭션 없음.
- 다중문장 DDL 실행은 pg 단순 프로토콜 전제 — Data API는 문장 분리 필요(C2.5 DataApiSqlRunner).
