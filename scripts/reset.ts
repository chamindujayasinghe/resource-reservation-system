import { sql } from "drizzle-orm";

import { db } from "@/server/db/client";

// Empties the development database completely so the migrations can be
// replayed from zero. Run through `npm run db:reset`, which then migrates
// and seeds.

async function reset(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to reset: NODE_ENV is production.");
  }

  // "public" holds the tables, enums and the btree_gist extension.
  // "drizzle" holds the record of which migrations have been applied.
  await db.execute(sql`drop schema if exists public cascade`);
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`create schema public`);

  console.log("Database emptied.");
}

reset()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end());
