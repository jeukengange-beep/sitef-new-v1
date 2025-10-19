declare module 'better-sqlite3' {
  interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  interface Statement<TRow = unknown> {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): TRow;
    all(...params: unknown[]): TRow[];
  }

  class BetterSqlite3Database {
    constructor(filename?: string, options?: { readonly?: boolean; fileMustExist?: boolean });
    readonly name: string;
    pragma(pragma: string): unknown;
    exec(sql: string): BetterSqlite3Database;
    prepare<TRow = unknown>(sql: string): Statement<TRow>;
    transaction<T extends (...params: unknown[]) => unknown>(fn: T): T;
    close(): void;
  }

  export = BetterSqlite3Database;
}
