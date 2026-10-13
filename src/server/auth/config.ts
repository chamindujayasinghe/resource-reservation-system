import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { z } from "zod";

import { userRole } from "@/server/db/schema";
import { verifyCredentials } from "@/server/services/users";
import { credentialsSchema } from "@/validation/auth";

const roleSchema = z.enum(userRole.enumValues);

export const { handlers, auth, signIn, signOut } = NextAuth({
  // The session is a JWT in an HTTP-only cookie, encrypted with AUTH_SECRET,
  // so the browser can neither read nor alter it. No session table is needed.
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      // Returning null makes Auth.js reject the sign-in.
      async authorize(rawCredentials) {
        const parsed = credentialsSchema.safeParse(rawCredentials);

        if (!parsed.success) {
          return null;
        }

        return verifyCredentials(parsed.data);
      },
    }),
  ],
  callbacks: {
    // Runs when the token is created or read. `user` is only present at
    // sign-in. Auth.js already stores the user id as `token.sub`.
    jwt({ token, user }) {
      if (user) {
        token.role = user.role;
      }
      return token;
    },
    // Copies id and role from the token onto the session object that
    // `auth()` returns. The token comes from a cookie, so it is validated.
    session({ session, token }) {
      const role = roleSchema.safeParse(token.role);

      if (token.sub && role.success) {
        session.user.id = token.sub;
        session.user.role = role.data;
      }
      return session;
    },
  },
});
