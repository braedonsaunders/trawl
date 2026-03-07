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

function isSqliteIoError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const details = error as Error & {
    code?: string;
    errcode?: number;
    errstr?: string;
  };

  return (
    details.code === "ERR_SQLITE_ERROR" &&
    (details.errcode === 522 ||
      /disk i\/o error/i.test(details.message) ||
      /disk i\/o error/i.test(details.errstr ?? ""))
  );
}

function ensureDatabaseDirectory(databasePath: string): void {
  fs.mkdirSync(path.dirname(databasePath), { recursive: true });
}

function openDatabase(databasePath: string): DatabaseSync {
  ensureDatabaseDirectory(databasePath);

  const database = new DatabaseSync(databasePath, {
    timeout: 5_000,
    enableForeignKeyConstraints: true,
  });

  try {
    database.exec("PRAGMA journal_mode = WAL");
  } catch (error) {
    if (!isSqliteIoError(error)) {
      database.close();
      throw error;
    }

    console.warn(
      `[db] Unable to enable WAL mode for ${databasePath}; continuing with SQLite's current journal mode.`
    );
  }

  database.exec("PRAGMA foreign_keys = ON");
  return database;
}

class SqliteStatement implements DatabaseStatement {
  constructor(
    private readonly client: SqliteDatabaseClient,
    private readonly sql: string,
    private statement: StatementSync,
    private generation: number
  ) {}

  private getStatement(): StatementSync {
    if (this.generation !== this.client.getGeneration()) {
      this.statement = this.client.prepareCurrent(this.sql);
      this.generation = this.client.getGeneration();
    }

    return this.statement;
  }

  all(...params: unknown[]): unknown[] {
    return this.client.runWithReconnect(() =>
      (
        this.getStatement() as unknown as {
          all: (...args: unknown[]) => unknown[];
        }
      ).all(...params)
    );
  }

  get(...params: unknown[]): unknown {
    return this.client.runWithReconnect(() =>
      (
        this.getStatement() as unknown as {
          get: (...args: unknown[]) => unknown;
        }
      ).get(...params)
    );
  }

  run(...params: unknown[]): StatementResultingChanges {
    try {
      return (
        this.getStatement() as unknown as {
          run: (...args: unknown[]) => StatementResultingChanges;
        }
      ).run(...params);
    } catch (error) {
      this.client.recoverFromIoError(error);
      throw error;
    }
  }
}

class SqliteDatabaseClient implements DatabaseClient {
  private transactionDepth = 0;
  private generation = 0;
  private database: DatabaseSync;

  constructor(private readonly databasePath: string) {
    this.database = openDatabase(databasePath);
  }

  close(): void {
    this.database.close();
  }

  getGeneration(): number {
    return this.generation;
  }

  prepareCurrent(sql: string): StatementSync {
    return this.database.prepare(sql);
  }

  private reconnect(): void {
    try {
      if (this.database.isOpen) {
        this.database.close();
      }
    } catch {
      // Ignore close failures while trying to recover the connection.
    }

    this.database = openDatabase(this.databasePath);
    this.generation += 1;
    this.transactionDepth = 0;
  }

  recoverFromIoError(error: unknown): void {
    if (!isSqliteIoError(error) || this.transactionDepth > 0) {
      return;
    }

    console.warn("[db] SQLite I/O error detected; reopening the database connection.");
    this.reconnect();
  }

  runWithReconnect<TResult>(operation: () => TResult): TResult {
    let hasRetried = false;

    while (true) {
      try {
        return operation();
      } catch (error) {
        if (!isSqliteIoError(error) || hasRetried || this.transactionDepth > 0) {
          throw error;
        }

        this.recoverFromIoError(error);
        hasRetried = true;
      }
    }
  }

  exec(sql: string): void {
    try {
      this.database.exec(sql);
    } catch (error) {
      this.recoverFromIoError(error);
      throw error;
    }
  }

  prepare(sql: string): DatabaseStatement {
    const statement = this.runWithReconnect(() => this.database.prepare(sql));
    return new SqliteStatement(this, sql, statement, this.generation);
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
        try {
          if (depth === 0) {
            this.database.exec("ROLLBACK");
          } else {
            this.database.exec(`ROLLBACK TO SAVEPOINT ${savepointName}`);
            this.database.exec(`RELEASE SAVEPOINT ${savepointName}`);
          }
        } catch {
          // Ignore rollback failures when SQLite has already lost the underlying file handle.
        }

        if (isSqliteIoError(error)) {
          this.reconnect();
        }

        throw error;
      } finally {
        this.transactionDepth = depth;
      }
    };
  }

  pragma(statement: string): void {
    this.exec(`PRAGMA ${statement}`);
  }
}

let db: SqliteDatabaseClient | null = null;

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

  const client = new SqliteDatabaseClient(getDbPath());

  try {
    runMigrations(client);
    db = client;
    return db;
  } catch (error) {
    client.close();
    throw error;
  }
}
