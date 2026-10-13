"use server";

import { AuthError } from "next-auth";

import { signIn, signOut } from "@/server/auth/config";
import { credentialsSchema } from "@/validation/auth";

import type { ActionState } from "./action-state";

const HOME_PATH = "/resources";
const SIGN_IN_PATH = "/login";

// One message for every failure, so the response never reveals whether an
// email address has an account (M1).
const SIGN_IN_FAILED = "Incorrect email or password.";

export async function signInAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const rawEmail = formData.get("email");
  const email = typeof rawEmail === "string" ? rawEmail : "";
  // The password is never sent back to the browser.
  const failure: ActionState = {
    ok: false,
    error: { message: SIGN_IN_FAILED, values: { email } },
  };

  const parsed = credentialsSchema.safeParse({
    email: rawEmail,
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return failure;
  }

  try {
    // On success this redirects, which Next.js implements by throwing.
    await signIn("credentials", { ...parsed.data, redirectTo: HOME_PATH });
  } catch (error) {
    if (error instanceof AuthError) {
      return failure;
    }
    throw error;
  }

  return { ok: true, data: undefined };
}

export async function signOutAction(): Promise<void> {
  await signOut({ redirectTo: SIGN_IN_PATH });
}
