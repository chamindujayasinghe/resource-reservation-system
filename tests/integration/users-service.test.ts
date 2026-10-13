import { hash } from "bcryptjs";
import { beforeEach, describe, expect, it } from "vitest";

import { verifyCredentials } from "@/server/services/users";
import { credentialsSchema } from "@/validation/auth";

import { createUser, resetDatabase } from "./helpers";

const PASSWORD = "correct-horse-battery";

describe("verifyCredentials", () => {
  beforeEach(async () => {
    await resetDatabase();
    await createUser({
      name: "Sanduni Fernando",
      email: "sanduni@example.com",
      role: "member",
      // Low cost keeps the test fast; the algorithm is the same.
      passwordHash: await hash(PASSWORD, 4),
    });
  });

  it("returns the user, without the password hash, for the right password", async () => {
    const user = await verifyCredentials({
      email: "sanduni@example.com",
      password: PASSWORD,
    });

    expect(user).toEqual({
      id: expect.any(String),
      name: "Sanduni Fernando",
      email: "sanduni@example.com",
      role: "member",
    });
  });

  it("returns null for a wrong password", async () => {
    const user = await verifyCredentials({
      email: "sanduni@example.com",
      password: "wrong-password",
    });

    expect(user).toBeNull();
  });

  it("returns null for an unknown email, the same as a wrong password", async () => {
    const user = await verifyCredentials({
      email: "nobody@example.com",
      password: PASSWORD,
    });

    expect(user).toBeNull();
  });

  it("accepts the email in any case once the form schema has normalised it", async () => {
    const credentials = credentialsSchema.parse({
      email: "  Sanduni@Example.COM ",
      password: PASSWORD,
    });

    const user = await verifyCredentials(credentials);

    expect(user?.email).toBe("sanduni@example.com");
  });
});
