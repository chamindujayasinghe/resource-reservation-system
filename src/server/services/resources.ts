import { and, asc, eq, ilike, sql, type SQL } from "drizzle-orm";

import { db } from "@/server/db/client";
import { resources } from "@/server/db/schema";
import { DomainError, mapDbError } from "@/server/errors";
import type { ResourceFilters, ResourceInput } from "@/validation/resources";

import { assertAdmin } from "./authorization";
import type { AuthenticatedUser } from "./users";

export type Resource = typeof resources.$inferSelect;

// Rethrows a database error as a DomainError when it is one we expect (a
// duplicate name), otherwise unchanged.
function rethrowMapped(error: unknown): never {
  throw mapDbError(error) ?? error;
}

// LIKE treats % and _ as wildcards. Escaping them makes a search for "50%"
// match the text "50%" rather than everything starting with "50".
function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (character) => `\\${character}`);
}

// M5. Members only ever see active resources; includeInactive is honoured for
// admins alone.
export async function listResources(
  actor: AuthenticatedUser,
  filters: ResourceFilters & { includeInactive?: boolean } = {},
): Promise<Resource[]> {
  const showInactive =
    actor.role === "admin" && filters.includeInactive === true;
  const conditions: SQL[] = [];

  if (!showInactive) {
    conditions.push(eq(resources.isActive, true));
  }
  if (filters.type) {
    conditions.push(eq(resources.type, filters.type));
  }
  if (filters.q) {
    conditions.push(ilike(resources.name, `%${escapeLikePattern(filters.q)}%`));
  }

  return db
    .select()
    .from(resources)
    .where(and(...conditions))
    .orderBy(asc(sql`lower(${resources.name})`));
}

// One resource, or null if it does not exist or the actor may not see it
// (an inactive resource, for a member).
export async function getResource(
  actor: AuthenticatedUser,
  id: string,
): Promise<Resource | null> {
  const rows = await db
    .select()
    .from(resources)
    .where(eq(resources.id, id))
    .limit(1);
  const resource = rows.at(0);

  if (!resource || (!resource.isActive && actor.role !== "admin")) {
    return null;
  }

  return resource;
}

// M3. New resources are active by default (database default).
export async function createResource(
  actor: AuthenticatedUser,
  input: ResourceInput,
): Promise<Resource> {
  assertAdmin(actor);

  try {
    const [created] = await db.insert(resources).values(input).returning();
    return created;
  } catch (error) {
    rethrowMapped(error);
  }
}

// M3. Does not change whether the resource is active; that is deactivation's
// job (M4).
export async function updateResource(
  actor: AuthenticatedUser,
  id: string,
  input: ResourceInput,
): Promise<Resource> {
  assertAdmin(actor);

  let updated: Resource | undefined;
  try {
    const rows = await db
      .update(resources)
      .set(input)
      .where(eq(resources.id, id))
      .returning();
    updated = rows.at(0);
  } catch (error) {
    rethrowMapped(error);
  }

  if (!updated) {
    throw new DomainError("NOT_FOUND", "That resource no longer exists.");
  }

  return updated;
}
