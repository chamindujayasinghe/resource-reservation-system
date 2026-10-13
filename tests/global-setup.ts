import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

// Runs once before the integration tests: brings the test database up to date
// with the same migration files the real database uses.
export default async function setup() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_TEST });

  try {
    await migrate(drizzle({ client: pool }), { migrationsFolder: "drizzle" });
  } finally {
    await pool.end();
  }
}
