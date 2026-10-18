import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

export function createDatabase(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 10_000,
  });
  // Idle connections can fail when the local database is restarted.
  pool.on("error", () => console.error("An idle database connection closed unexpectedly."));
  return { db: drizzle(pool), pool };
}

export type Database = ReturnType<typeof createDatabase>["db"];
const globalDatabase = globalThis as typeof globalThis & {
  flashpointDatabase?: ReturnType<typeof createDatabase>;
};

export function getDatabase() {
  if (!globalDatabase.flashpointDatabase) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is missing. Follow the local database setup in README.md.");
    globalDatabase.flashpointDatabase = createDatabase(url);
  }
  return globalDatabase.flashpointDatabase.db;
}
