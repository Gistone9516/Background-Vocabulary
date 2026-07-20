// 리포 조립 팩토리. SqlRunner 하나로 4개 리포를 만든다.

import type { SqlRunner, Repositories } from "@vock/shared";
import { SessionRepositoryImpl } from "./session-repo.js";
import { AssetRepositoryImpl } from "./asset-repo.js";
import { KnowledgeRepositoryImpl } from "./knowledge-repo.js";
import { ProjectRepositoryImpl } from "./project-repo.js";

export function buildRepositories(sql: SqlRunner): Repositories {
  return {
    sessions: new SessionRepositoryImpl(sql),
    assets: new AssetRepositoryImpl(sql),
    knowledge: new KnowledgeRepositoryImpl(sql),
    projects: new ProjectRepositoryImpl(sql),
  };
}

export { SessionRepositoryImpl } from "./session-repo.js";
export { AssetRepositoryImpl } from "./asset-repo.js";
export { KnowledgeRepositoryImpl } from "./knowledge-repo.js";
export { ProjectRepositoryImpl } from "./project-repo.js";
export { PgUserRepository } from "./user-repo.js";
export { PgJtiBlacklist } from "./jti-blacklist.js";
