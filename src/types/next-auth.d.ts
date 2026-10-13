import type { DefaultSession } from "next-auth";

import type { UserRole } from "@/server/db/schema";

// Extends Auth.js's types with the fields this application adds.
declare module "next-auth" {
  interface User {
    role: UserRole;
  }

  interface Session {
    user: {
      id: string;
      role: UserRole;
    } & DefaultSession["user"];
  }
}
