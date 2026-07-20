// 프로젝트 리포. 삭제는 세션·자산의 소속만 해제(FK ON DELETE SET NULL), 세션은 보존.

import type { SqlRunner, ProjectRepository, Project } from "@vock/shared";
import { asNum } from "../json.js";

type Row = Record<string, unknown>;

export class ProjectRepositoryImpl implements ProjectRepository {
  constructor(private readonly sql: SqlRunner) {}

  async list(userId: string): Promise<Project[]> {
    const rows = await this.sql.query<Row>("SELECT project_id, user_id, name, created_at FROM projects WHERE user_id = $1 ORDER BY created_at DESC", [userId]);
    return rows.map((r) => ({
      project_id: r.project_id as string,
      user_id: r.user_id as string,
      name: r.name as string,
      created_at: asNum(r.created_at),
    }));
  }

  async create(p: Project): Promise<Project> {
    await this.sql.execute("INSERT INTO projects (project_id, user_id, name, created_at) VALUES ($1,$2,$3,$4)", [p.project_id, p.user_id, p.name, p.created_at]);
    return p;
  }

  async delete(userId: string, projectId: string): Promise<boolean> {
    const r = await this.sql.execute("DELETE FROM projects WHERE project_id = $1 AND user_id = $2", [projectId, userId]);
    return r.rowCount > 0;
  }
}
