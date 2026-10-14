import { randomUUID } from "node:crypto";

import { compare, hashSync } from "bcryptjs";
import { eq } from "drizzle-orm";

import { db } from "@/server/db/client";
import { users, type UserRole } from "@/server/db/schema";
import type { Credentials } from "@/validation/auth";

// The signed-in user as the rest of the application sees them. Never
// includes the password hash.
export type AuthenticatedUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
};

// Compared against when the email is unknown, so that a wrong email and a
// wrong password take about the same time to reject.
const UNKNOWN_USER_HASH = hashSync(randomUUID(), 10);

// The user as currently stored, or null if the id no longer exists (for
// example, a session cookie issued before the database was reset).
export async function findUserById(
  id: string,
): Promise<AuthenticatedUser | null> {
  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1);

  return rows.at(0) ?? null;
}

// Returns the user if the email exists and the password matches, else null.
// The caller cannot tell which of the two was wrong (M1).
export async function verifyCredentials(
  credentials: Credentials,
): Promise<AuthenticatedUser | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, credentials.email))
    .limit(1);
  const user = rows.at(0);

  const passwordMatches = await compare(
    credentials.password,
    user?.passwordHash ?? UNKNOWN_USER_HASH,
  );

  if (!user || !passwordMatches) {
    return null;
  }

  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
