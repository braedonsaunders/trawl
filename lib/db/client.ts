import { DatabaseSync, type StatementSync, type StatementResultingChanges } from "node:sqlite";
import * as fs from "fs";
import * as path from "path";
import { getDbPath, getMigrationsDir } from "@/lib/runtime/paths";

export interface DatabaseStatement {
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
  run(...params: unknown[]): StatementResultingChanges;
}

export interface DatabaseClient {
  exec(sql: string): void;
  prepare(sql: string): DatabaseStatement;
  transaction<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult
  ): (...args: TArgs) => TResult;
  pragma(statement: string): void;
}

class SqliteStatement implements DatabaseStatement {
  constructor(private readonly statement: StatementSync) {}

  all(...params: unknown[]): unknown[] {
    return (
      this.statement as unknown as { all: (...args: unknown[]) => unknown[] }
    ).all(...params);
  }

  get(...params: unknown[]): unknown {
    return (this.statement as unknown as { get: (...args: unknown[]) => unknown }).get(
      ...params
    );
  }

  run(...params: unknown[]): StatementResultingChanges {
    return (
      this.statement as unknown as {
        run: (...args: unknown[]) => StatementResultingChanges;
      }
    ).run(...params);
  }
}

class SqliteDatabaseClient implements DatabaseClient {
  private transactionDepth = 0;

  constructor(private readonly database: DatabaseSync) {}

  exec(sql: string): void {
    this.database.exec(sql);
  }

  prepare(sql: string): DatabaseStatement {
    return new SqliteStatement(this.database.prepare(sql));
  }

  transaction<TArgs extends unknown[], TResult>(
    fn: (...args: TArgs) => TResult
  ): (...args: TArgs) => TResult {
    return (...args: TArgs): TResult => {
      const depth = this.transactionDepth;
      const savepointName = `trawl_tx_${depth + 1}`;

      this.transactionDepth += 1;

      try {
        if (depth === 0) {
          this.database.exec("BEGIN");
        } else {
          this.database.exec(`SAVEPOINT ${savepointName}`);
        }

        const result = fn(...args);

        if (depth === 0) {
          this.database.exec("COMMIT");
        } else {
          this.database.exec(`RELEASE SAVEPOINT ${savepointName}`);
        }

        return result;
      } catch (error) {
        if (depth === 0) {
          this.database.exec("ROLLBACK");
        } else {
          this.database.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
          this.database.exec(`RELEASE SAVEPOINT ${savepointName}`);
        }

        throw error;
      } finally {
        this.transactionDepth = depth;
      }
    };
  }

  pragma(statement: string): void {
    this.database.exec(`PRAGMA ${statement}`);
  }
}

let db: DatabaseClient | null = null;

function runMigrations(database: DatabaseClient): void {
  const migrationsDir = getMigrationsDir();

  // Create a migrations tracking table
  database.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const applied = new Set(
    database
      .prepare("SELECT name FROM _migrations")
      .all()
      .map((row) => (row as { name: string }).name)
  );

  if (!fs.existsSync(migrationsDir)) return;

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    if (applied.has(file)) continue;

    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
    database.exec(sql);
    database.prepare("INSERT INTO _migrations (name) VALUES (?)").run(file);
  }
}

export function getDb(): DatabaseClient {
  if (db) return db;

  db = new SqliteDatabaseClient(new DatabaseSync(getDbPath()));

  // Enable WAL mode for better concurrent read performance
  db.pragma("journal_mode = WAL");
  // Enable foreign keys
  db.pragma("foreign_keys = ON");

  runMigrations(db);

  return db;
}
