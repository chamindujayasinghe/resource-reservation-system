import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

import { userRole } from "@/server/db/schema";
import type { AuthenticatedUser } from "@/server/services/users";

import { auth } from "./config";

const sessionUserSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  email: z.string(),
  role: z.enum(userRole.enumValues),
});

// The signed-in user, or null. Cached for the duration of one request, so a
// layout and a page asking separately read the session only once.
export const getCurrentUser = cache(
  async (): Promise<AuthenticatedUser | null> => {
    const session = await auth();
    const parsed = sessionUserSchema.safeParse(session?.user);

    return parsed.success ? parsed.data : null;
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
