/**
 * Minimal type declarations for sql.js v1.10+
 *
 * sql.js does not ship its own .d.ts files, so we provide
 * just enough types for the novel-weaver database layer.
 */

declare module 'sql.js' {
  /** Result of db.exec() */
  export interface QueryExecResult {
    columns: string[];
    values: unknown[][];
  }

  /** A prepared statement — iterate with step(), read with getAsObject() */
  export interface Statement {
    /** Advance to the next result row. Returns false when exhausted. */
    step(): boolean;
    /**
     * Return the current row as an object keyed by column name.
     * Must call step() first; returns undefined if no row.
     */
    getAsObject(): Record<string, unknown> | undefined;
    /** Return the current row as a positional array. */
    get(): unknown[] | undefined;
    /** Bind positional or named parameters to the statement. */
    bind(params?: unknown[] | Record<string, unknown>): boolean;
    /** Reset the statement so it can be re-executed. */
    reset(): void;
    /** Release resources held by this statement. */
    free(): void;
  }

  /** A sql.js database instance — all operations are synchronous. */
  export interface Database {
    /**
     * Execute a single SQL statement (or multiple separated by ";")
     * with optional bound parameters.
     */
    run(sql: string, params?: unknown[]): Database;

    /**
     * Execute one or more SQL statements and return the result sets.
     * Each result set has { columns: string[], values: unknown[][] }.
     */
    exec(sql: string): QueryExecResult[];

    /**
     * Prepare a SQL statement for repeated execution.
     * The returned Statement MUST be freed via .free() when done.
     */
    prepare(sql: string): Statement;

    /**
     * Export the entire database as a Uint8Array (SQLite binary format).
     * Use this to persist to disk.
     */
    export(): Uint8Array;

    /** Close the database and release all resources. */
    close(): void;
  }

  /** The sql.js module after initSqlJs() resolves */
  export interface SqlJsStatic {
    /** Constructor for a new or loaded database. */
    Database: new (data?: ArrayLike<number> | Buffer | null) => Database;
  }

  /**
   * Initialize the sql.js WASM module.
   * Must be called once before any Database can be created.
   * @param config Optional configuration (e.g. locateFile for custom WASM path).
   */
  export default function initSqlJs(
    config?: { locateFile?: (file: string) => string }
  ): Promise<SqlJsStatic>;
}
