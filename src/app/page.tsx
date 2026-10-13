import { sql } from "drizzle-orm";
import { connection } from "next/server";

import { db } from "@/server/db/client";

async function isDatabaseReachable(): Promise<boolean> {
  try {
    await db.execute(sql`select 1`);
    return true;
  } catch (error) {
    console.error("Database check failed:", error);
    return false;
  }
}

export default async function Home() {
  // Render per request, so the build never needs a running database.
  await connection();

  const connected = await isDatabaseReachable();

  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <p className="text-lg font-medium">
        {connected
          ? "Database connected"
          : "Database not reachable. Is the container running?"}
      </p>
    </main>
  );
}
