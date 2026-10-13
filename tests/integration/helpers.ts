import { randomUUID } from "node:crypto";

import { sql } from "drizzle-orm";

import { db } from "@/server/db/client";
import { resources, users } from "@/server/db/schema";

// Empties every table. Refuses to run against anything but a test database.
export async function resetDatabase(): Promise<void> {
  const result = await db.execute<{ name: string }>(
    sql`select current_database() as name`,
  );
  const name = result.rows[0]?.name;

  if (!name?.endsWith("_test")) {
    throw new Error(`Refusing to truncate "${name}": not a test database.`);
  }

  await db.execute(sql`truncate table reservations, resources, users`);
}

export async function createUser(
  overrides: Partial<typeof users.$inferInsert> = {},
) {
  const [user] = await db
    .insert(users)
    .values({
      name: "Test User",
      email: `user-${randomUUID()}@example.com`,
      passwordHash: "not-a-real-hash",
      ...overrides,
    })
    .returning();

  return user;
}

export async function createResource(
  overrides: Partial<typeof resources.$inferInsert> = {},
) {
  const [resource] = await db
    .insert(resources)
    .values({
      name: `Room ${randomUUID()}`,
      type: "room",
      location: "Level 1",
      ...overrides,
    })
    .returning();

  return resource;
}
