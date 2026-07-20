// SqlRunner의 node-postgres 구현(local 계층). aws는 Data API 구현을 별도로 둔다(C2.5).
// 파라미터가 없으면 pg 단순 프로토콜(다중 문장 DDL 허용), 있으면 확장 프로토콜을 쓴다.

import pg from "pg";
import type { SqlRunner } from "@vock/shared";

type Queryable = pg.Pool | pg.PoolClient;

async function run(q: Queryable, sql: string, params: readonly unknown[]): Promise<pg.QueryResult> {
  return params.length ? q.query(sql, params as unknown[]) : q.query(sql);
}

// 트랜잭션 클라이언트 내부 러너(중첩 트랜잭션은 평탄 실행).
class ClientRunner implements SqlRunner {
  constructor(private readonly client: pg.PoolClient) {}
  async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    return (await run(this.client, sql, params)).rows as T[];
  }
  async execute(sql: string, params: readonly unknown[] = []): Promise<{ rowCount: number }> {
    return { rowCount: (await run(this.client, sql, params)).rowCount ?? 0 };
  }
  async transaction<T>(fn: (tx: SqlRunner) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

export class PgSqlRunner implements SqlRunner {
  constructor(private readonly pool: pg.Pool) {}

  async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    return (await run(this.pool, sql, params)).rows as T[];
  }

  async execute(sql: string, params: readonly unknown[] = []): Promise<{ rowCount: number }> {
    return { rowCount: (await run(this.pool, sql, params)).rowCount ?? 0 };
  }

  async transaction<T>(fn: (tx: SqlRunner) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(new ClientRunner(client));
      await client.query("COMMIT");
      return result;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  }
}

export function createPgPool(connectionString: string): pg.Pool {
  return new pg.Pool({ connectionString });
}
