const READ_ONLY_ERROR = "Public request database access is read-only";

function assertSelect(query: string): void {
  const normalized = query.trim().replace(/;$/, "").trimEnd();
  const keyword = /^([a-z]+)/i.exec(normalized)?.[1]?.toUpperCase();
  if (keyword !== "SELECT") throw new Error(`${READ_ONLY_ERROR}; ${keyword ?? "unknown"} statements are prohibited`);
  if (normalized.includes(";")) throw new Error(`${READ_ONLY_ERROR}; multiple statements are prohibited`);
}

function readOnlyStatement(statement: D1PreparedStatement): D1PreparedStatement {
  return {
    bind(...values: unknown[]) {
      return readOnlyStatement(statement.bind(...values));
    },
    first<T = Record<string, unknown>>(columnName?: string): Promise<T | null> {
      return columnName === undefined
        ? statement.first<T>()
        : statement.first<T>(columnName);
    },
    run<T = Record<string, unknown>>(): Promise<D1Result<T>> {
      return Promise.reject(new Error(`${READ_ONLY_ERROR}; run() is prohibited`));
    },
    all<T = Record<string, unknown>>(): Promise<D1Result<T>> {
      return statement.all<T>();
    },
    raw<T = unknown[]>(options?: { columnNames?: boolean }): Promise<T[] | [string[], ...T[]]> {
      return options?.columnNames
        ? statement.raw<T>({ columnNames: true })
        : statement.raw<T>();
    }
  } as D1PreparedStatement;
}

/**
 * A fail-closed D1 capability for public request handlers.
 *
 * Public reads receive only SELECT preparation and read execution methods. Schema
 * initialization and every other mutation remain exclusive to migrations and the
 * scheduled/explicit maintenance lanes.
 */
export function readOnlyD1(database: D1Database): D1Database {
  return {
    prepare(query: string): D1PreparedStatement {
      assertSelect(query);
      return readOnlyStatement(database.prepare(query));
    },
    batch<T = unknown>(): Promise<D1Result<T>[]> {
      return Promise.reject(new Error(`${READ_ONLY_ERROR}; batch() is prohibited`));
    },
    exec(): Promise<D1ExecResult> {
      return Promise.reject(new Error(`${READ_ONLY_ERROR}; exec() is prohibited`));
    },
    withSession(): D1DatabaseSession {
      throw new Error(`${READ_ONLY_ERROR}; sessions are prohibited`);
    },
    dump(): Promise<ArrayBuffer> {
      return Promise.reject(new Error(`${READ_ONLY_ERROR}; dump() is prohibited`));
    }
  } as D1Database;
}
