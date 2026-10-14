import { DomainError } from "@/server/errors";

import type { AuthenticatedUser } from "./users";

// Called first by every admin-only service function (M2). Hiding a button is
// not protection: a server action can be called directly.
export function assertAdmin(actor: AuthenticatedUser): void {
  if (actor.role !== "admin") {
    throw new DomainError(
      "FORBIDDEN",
      "You do not have permission to do that.",
    );
  }
}
