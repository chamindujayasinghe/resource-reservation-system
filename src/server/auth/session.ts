import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

import { findUserById, type AuthenticatedUser } from "@/server/services/users";

import { auth } from "./config";

const sessionUserIdSchema = z.uuid();

// The signed-in user, or null. Only the id is taken from the session cookie;
// the user is then loaded from the database, so a cookie for a user who no
// longer exists (after a database reset) counts as signed out, and name and
// role are always current. Cached for the duration of one request, so a
// layout and a page asking separately cost one lookup.
export const getCurrentUser = cache(
  async (): Promise<AuthenticatedUser | null> => {
    const session = await auth();
    const userId = sessionUserIdSchema.safeParse(session?.user?.id);

    if (!userId.success) {
      return null;
    }

    return findUserById(userId.data);
  },
);

// For any signed-in page or action. Visitors are sent to the sign-in page.
// Call before any try block: redirect() works by throwing.
export async function requireUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}

// For admin pages. Members get the not-found page, so the existence of an
// admin URL is not confirmed to them.
export async function requireAdmin(): Promise<AuthenticatedUser> {
  const user = await requireUser();

  if (user.role !== "admin") {
    notFound();
  }

  return user;
}
