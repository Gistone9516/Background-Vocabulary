// SqlRunner의 RDS Data API 구현(aws 계층). 리포는 그대로 재사용된다(SqlRunner 뒤 드라이버 교체).
// $n 위치 파라미터를 :pn 명명 파라미터로 변환하고, Field 응답을 row 객체로 매핑한다.
// ★ 배포 게이트 코드 — 로컬 스모크 불가(실 Aurora 필요). 첫 AWS 실행에서 검증할 것.
// Data API 제약(§6): 트랜잭션 3분 유휴 롤백(짧게), 응답 1MB(목록은 커서 페이지네이션 — 리포가 준수).

import {
  RDSDataClient,
  ExecuteStatementCommand,
  BeginTransactionCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
  type SqlParameter,
  type Field,
  type ColumnMetadata,
} from "@aws-sdk/client-rds-data";
import type { SqlRunner } from "@vock/shared";

export interface DataApiConfig {
  resourceArn: string;
  secretArn: string;
  database: string;
}

function toNamed(sql: string): string {
  return sql.replace(/\$(\d+)/g, (_m, n: string) => `:p${n}`);
}

function toParams(params: readonly unknown[]): SqlParameter[] {
  return params.map((v, i) => {
    const name = `p${i + 1}`;
    if (v === null || v === undefined) return { name, value: { isNull: true } };
    if (typeof v === "number") return Number.isInteger(v) ? { name, value: { longValue: v } } : { name, value: { doubleValue: v } };
    if (typeof v === "boolean") return { name, value: { booleanValue: v } };
    return { name, value: { stringValue: String(v) } };
  });
}

function fieldValue(f: Field): unknown {
  if (f.isNull) return null;
  if (f.stringValue !== undefined) return f.stringValue;
  if (f.longValue !== undefined) return f.longValue;
  if (f.doubleValue !== undefined) return f.doubleValue;
  if (f.booleanValue !== undefined) return f.booleanValue;
  if (f.blobValue !== undefined) return f.blobValue;
  return null;
}

function toRows(records: Field[][] | undefined, columnMetadata: ColumnMetadata[] | undefined): Record<string, unknown>[] {
  const cols = (columnMetadata ?? []).map((c) => c.name ?? "");
  return (records ?? []).map((rec) => {
    const row: Record<string, unknown> = {};
    rec.forEach((f, i) => {
      row[cols[i] ?? String(i)] = fieldValue(f);
    });
    return row;
  });
}

class DataApiRunner implements SqlRunner {
  constructor(
    private readonly client: RDSDataClient,
    private readonly cfg: DataApiConfig,
    private readonly transactionId?: string,
  ) {}

  private base(sql: string, params: readonly unknown[]) {
    return {
      resourceArn: this.cfg.resourceArn,
      secretArn: this.cfg.secretArn,
      database: this.cfg.database,
      sql: toNamed(sql),
      parameters: toParams(params),
      includeResultMetadata: true,
      ...(this.transactionId ? { transactionId: this.transactionId } : {}),
    };
  }

  async query<T = Record<string, unknown>>(sql: string, params: readonly unknown[] = []): Promise<T[]> {
    const out = await this.client.send(new ExecuteStatementCommand(this.base(sql, params)));
    return toRows(out.records, out.columnMetadata) as T[];
  }

  async execute(sql: string, params: readonly unknown[] = []): Promise<{ rowCount: number }> {
    const out = await this.client.send(new ExecuteStatementCommand(this.base(sql, params)));
    return { rowCount: out.numberOfRecordsUpdated ?? 0 };
  }

  async transaction<T>(fn: (tx: SqlRunner) => Promise<T>): Promise<T> {
    if (this.transactionId) return fn(this); // 이미 트랜잭션 내 — 평탄 실행(중첩 금지, 3분 규칙 정합)
    const begin = await this.client.send(new BeginTransactionCommand({ resourceArn: this.cfg.resourceArn, secretArn: this.cfg.secretArn, database: this.cfg.database }));
    const txId = begin.transactionId;
    if (!txId) throw new Error("Data API: transactionId 없음");
    const txRunner = new DataApiRunner(this.client, this.cfg, txId);
    try {
      const result = await fn(txRunner);
      await this.client.send(new CommitTransactionCommand({ resourceArn: this.cfg.resourceArn, secretArn: this.cfg.secretArn, transactionId: txId }));
      return result;
    } catch (e) {
      await this.client.send(new RollbackTransactionCommand({ resourceArn: this.cfg.resourceArn, secretArn: this.cfg.secretArn, transactionId: txId })).catch(() => {});
      throw e;
    }
  }
}

export class DataApiSqlRunner extends DataApiRunner {
  constructor(cfg: DataApiConfig, region?: string) {
    super(new RDSDataClient(region ? { region } : {}), cfg);
  }
}
