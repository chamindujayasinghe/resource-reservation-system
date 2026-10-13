import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/server/db/client";
import { reservations, resources } from "@/server/db/schema";
import { DomainError, mapDbError } from "@/server/errors";

import { createResource, createUser, resetDatabase } from "./helpers";

// Risk R4 (plan section 9): the ORM may wrap the driver error. These tests
// raise real PostgreSQL errors through Drizzle and check they are recognised.

async function captureError(action: () => Promise<unknown>): Promise<unknown> {
  try {
    await action();
  } catch (error) {
    return error;
  }
  throw new Error("Expected the action to throw, but it succeeded.");
}

describe("mapDbError", () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  it("maps an overlap on reservations_no_overlap to SLOT_TAKEN", async () => {
    const resource = await createResource();
    const user = await createUser();
    const slot = {
      resourceId: resource.id,
      userId: user.id,
      title: "Sprint planning",
      startAt: new Date("2030-01-15T09:00:00Z"),
      endAt: new Date("2030-01-15T10:00:00Z"),
    };
    await db.insert(reservations).values(slot);

    const error = await captureError(() =>
      db.insert(reservations).values(slot),
    );
    const mapped = mapDbError(error);

    expect(mapped).toBeInstanceOf(DomainError);
    expect(mapped?.code).toBe("SLOT_TAKEN");
  });

  it("maps a duplicate resource name, ignoring case, to VALIDATION on name", async () => {
    await createResource({ name: "Boardroom" });

    const error = await captureError(() =>
      db
        .insert(resources)
        .values({ name: "BOARDROOM", type: "room", location: "Level 3" }),
    );
    const mapped = mapDbError(error);

    expect(mapped).toBeInstanceOf(DomainError);
    expect(mapped?.code).toBe("VALIDATION");
    expect(mapped?.field).toBe("name");
  });

  it("does not map a check violation, which signals an application bug", async () => {
    const error = await captureError(() =>
      db.insert(resources).values({
        name: "Tiny room",
        type: "room",
        location: "x",
        capacity: 0,
      }),
    );

    expect(mapDbError(error)).toBeUndefined();
  });

  it("does not map errors that did not come from the database", () => {
    expect(mapDbError(new Error("network down"))).toBeUndefined();
    expect(mapDbError("not an error")).toBeUndefined();
  });
});
