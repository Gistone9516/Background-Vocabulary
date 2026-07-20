// 마이그레이션 러너. 패키지 루트 migrations/*.sql를 순번대로 1회씩 적용한다(SqlRunner 경유).
// 로컬(Docker PG)과 Aurora가 같은 SQL 파일을 사용한다.
// DDL은 문장(;) 단위로 쪼개 개별 실행한다 — pg·Data API(다중문장 불가) 공용.

import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import type { SqlRunner } from "@vock/shared";

// SQL 파일을 문장 단위로 분리한다(문자열 내 세미콜론이 없는 우리 DDL 전제). 주석/빈 문장 제거.
function splitStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.replace(/--.*$/gm, "").trim().length > 0);
}

// dist/migrate.js 또는 src/migrate.ts 어디서 실행하든 패키지 루트의 migrations/를 찾는다.
function migrationsDir(): string {
  let d = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = resolve(d, "migrations");
    try {
      readdirSync(candidate);
      return candidate;
    } catch {
      d = resolve(d, "..");
    }
  }
  throw new Error("migrations 디렉터리를 찾지 못했습니다");
}

export async function migrate(sql: SqlRunner): Promise<string[]> {
  await sql.execute("CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at BIGINT NOT NULL)");
  const dir = migrationsDir();
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const applied: string[] = [];
  for (const name of files) {
    const done = await sql.query<{ name: string }>("SELECT name FROM _migrations WHERE name = $1", [name]);
    if (done.length) continue;
    const statements = splitStatements(readFileSync(join(dir, name), "utf-8"));
    await sql.transaction(async (tx) => {
      for (const stmt of statements) await tx.execute(stmt);
      await tx.execute("INSERT INTO _migrations (name, applied_at) VALUES ($1, $2)", [name, Date.now()]);
    });
    applied.push(name);
  }
  return applied;
}
