// @vock/persistence 공개 표면. 마이그레이션 러너와 리포 조립 팩토리.
// 드라이버(SqlRunner 구현)는 여기 없다 — local(PgSqlRunner)·aws(DataApiSqlRunner)가 주입한다.
export { migrate } from "./migrate.js";
export { buildRepositories } from "./repositories/index.js";
export { SessionRepositoryImpl, AssetRepositoryImpl, KnowledgeRepositoryImpl, ProjectRepositoryImpl } from "./repositories/index.js";
