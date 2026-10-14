import { randomUUID } from "node:crypto";

import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { wallTimeToUtc } from "@/domain/time";
import { db } from "@/server/db/client";
import { reservations } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import {
  cancelReservation,
  createReservation,
  getReservationForEdit,
  updateReservation,
} from "@/server/services/reservations";
import type { AuthenticatedUser } from "@/server/services/users";

import * as fixtures from "./helpers";

// "Now" is 08:00 Colombo time the day before the bookings.
const NOW = wallTimeToUtc("2030-01-14", "08:00");
const DATE = "2030-01-15";

async function createActor(
  role: AuthenticatedUser["role"] = "member",
): Promise<AuthenticatedUser> {
  const user = await fixtures.createUser({ role });
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

const booking = (start: string, end: string, title = "Team meeting") => ({
  date: DATE,
  start,
  end,
  title,
  attendeeCount: null,
});

async function rowOf(id: string) {
  const [row] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.id, id));
  return row;
}

describe("updateReservation (S1)", () => {
  let owner: AuthenticatedUser;
  let resourceId: string;
  let reservationId: string;

  beforeEach(async () => {
    await fixtures.resetDatabase();
    owner = await createActor();
    resourceId = (await fixtures.createResource()).id;
    reservationId = (
      await createReservation(owner, resourceId, booking("09:00", "10:00"), NOW)
    ).id;
  });

  // The original row, to compare against after a refused edit.
  const original = () => ({
    title: "Team meeting",
    startAt: wallTimeToUtc(DATE, "09:00"),
    endAt: wallTimeToUtc(DATE, "10:00"),
    status: "confirmed",
  });

  it("moves the reservation and changes its title", async () => {
    await updateReservation(
      owner,
      reservationId,
      {
        date: "2030-01-16",
        start: "14:00",
        end: "15:30",
        title: "Retro",
        attendeeCount: null,
      },
      NOW,
    );

    expect(await rowOf(reservationId)).toMatchObject({
      title: "Retro",
      startAt: wallTimeToUtc("2030-01-16", "14:00"),
      endAt: wallTimeToUtc("2030-01-16", "15:30"),
      status: "confirmed",
      resourceId,
      userId: owner.id,
    });
  });

  it("allows shifting within its own time range (no conflict with itself)", async () => {
    await expect(
      updateReservation(owner, reservationId, booking("09:30", "10:00"), NOW),
    ).resolves.toMatchObject({ startAt: wallTimeToUtc(DATE, "09:30") });
    await expect(
      updateReservation(owner, reservationId, booking("08:30", "10:30"), NOW),
    ).resolves.toMatchObject({ endAt: wallTimeToUtc(DATE, "10:30") });
  });

  it("refuses a move into another reservation and leaves the original unchanged", async () => {
    const other = await createActor();
    await createReservation(other, resourceId, booking("11:00", "12:00"), NOW);

    await expect(
      updateReservation(
        owner,
        reservationId,
        booking("10:30", "11:30", "Moved"),
        NOW,
      ),
    ).rejects.toMatchObject({ code: "SLOT_TAKEN" });
    expect(await rowOf(reservationId)).toMatchObject(original());
  });

  it("applies the time rules again and leaves the original unchanged", async () => {
    await expect(
      updateReservation(owner, reservationId, booking("06:30", "07:30"), NOW),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      updateReservation(
        owner,
        reservationId,
        { ...booking("09:00", "10:00"), date: "2030-01-13" },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(await rowOf(reservationId)).toMatchObject(original());
  });

  it("refuses more attendees than the capacity and leaves the original unchanged (BR16)", async () => {
    const room = await fixtures.createResource({ capacity: 4 });
    const roomBookingId = (
      await createReservation(owner, room.id, booking("09:00", "10:00"), NOW)
    ).id;

    await expect(
      updateReservation(
        owner,
        roomBookingId,
        { ...booking("09:00", "10:00"), attendeeCount: 5 },
        NOW,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION", field: "attendeeCount" });
    expect(await rowOf(roomBookingId)).toMatchObject({
      ...original(),
      attendeeCount: null,
    });
  });

  it("refuses another member and an admin alike (BR21)", async () => {
    const otherMember = await createActor("member");
    const admin = await createActor("admin");

    for (const actor of [otherMember, admin]) {
      await expect(
        updateReservation(actor, reservationId, booking("13:00", "14:00"), NOW),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    expect(await rowOf(reservationId)).toMatchObject(original());
  });

  it("refuses a cancelled reservation", async () => {
    await cancelReservation(owner, reservationId, {}, NOW);

    await expect(
      updateReservation(owner, reservationId, booking("13:00", "14:00"), NOW),
    ).rejects.toMatchObject({ code: "ALREADY_CANCELLED" });
    expect((await rowOf(reservationId)).startAt).toEqual(
      wallTimeToUtc(DATE, "09:00"),
    );
  });

  it("refuses once the reservation has started (BR22)", async () => {
    const atStart = wallTimeToUtc(DATE, "09:00");

    await expect(
      updateReservation(
        owner,
        reservationId,
        booking("13:00", "14:00"),
        atStart,
      ),
    ).rejects.toMatchObject({ code: "ALREADY_STARTED" });
    expect(await rowOf(reservationId)).toMatchObject(original());
  });

  it("reports NOT_FOUND for an unknown id", async () => {
    await expect(
      updateReservation(owner, randomUUID(), booking("13:00", "14:00"), NOW),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("lets only one of two simultaneous edits into the same slot succeed", async () => {
    const other = await createActor();
    const otherId = (
      await createReservation(other, resourceId, booking("15:00", "16:00"), NOW)
    ).id;

    const results = await Promise.allSettled([
      updateReservation(owner, reservationId, booking("13:00", "14:00"), NOW),
      updateReservation(other, otherId, booking("13:30", "14:30"), NOW),
    ]);

    const codes = results.map((r) =>
      r.status === "fulfilled"
        ? "ok"
        : r.reason instanceof DomainError
          ? r.reason.code
          : "unexpected",
    );
    expect(codes.sort()).toEqual(["SLOT_TAKEN", "ok"]);

    // Both reservations still exist; the loser kept its original time.
    const confirmed = await db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.resourceId, resourceId),
          eq(reservations.status, "confirmed"),
        ),
      );
    expect(confirmed).toHaveLength(2);
  });
});

describe("getReservationForEdit (S1)", () => {
  let owner: AuthenticatedUser;
  let reservationId: string;

  beforeEach(async () => {
    await fixtures.resetDatabase();
    owner = await createActor();
    const resourceId = (await fixtures.createResource()).id;
    reservationId = (
      await createReservation(owner, resourceId, booking("09:00", "10:00"), NOW)
    ).id;
  });

  it("returns the owner's upcoming reservation with its resource name", async () => {
    await expect(
      getReservationForEdit(owner, reservationId, NOW),
    ).resolves.toMatchObject({
      id: reservationId,
      title: "Team meeting",
      resourceName: expect.any(String),
    });
  });

  it("returns null for anyone else, including an admin", async () => {
    for (const role of ["member", "admin"] as const) {
      const actor = await createActor(role);
      await expect(
        getReservationForEdit(actor, reservationId, NOW),
      ).resolves.toBeNull();
    }
  });

  it("returns null once cancelled or started", async () => {
    await expect(
      getReservationForEdit(owner, reservationId, wallTimeToUtc(DATE, "09:00")),
    ).resolves.toBeNull();

    await cancelReservation(owner, reservationId, {}, NOW);
    await expect(
      getReservationForEdit(owner, reservationId, NOW),
    ).resolves.toBeNull();
  });
});
