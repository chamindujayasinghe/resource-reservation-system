import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { wallTimeToUtc } from "@/domain/time";
import { db } from "@/server/db/client";
import { reservations } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import {
  cancelReservation,
  createReservation,
  listMyReservations,
} from "@/server/services/reservations";
import type { AuthenticatedUser } from "@/server/services/users";

import * as fixtures from "./helpers";

// "Now" is 08:00 Colombo time the day before the bookings.
const NOW = wallTimeToUtc("2030-01-14", "08:00");
const DATE = "2030-01-15";

async function createMember(): Promise<AuthenticatedUser> {
  const user = await fixtures.createUser({ role: "member" });
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

const booking = (start: string, end: string, title = "Team meeting") => ({
  date: DATE,
  start,
  end,
  title,
});

async function rowOf(id: string) {
  const [row] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.id, id));
  return row;
}

describe("cancelReservation (owner, M9)", () => {
  let owner: AuthenticatedUser;
  let resourceId: string;
  let reservationId: string;

  beforeEach(async () => {
    await fixtures.resetDatabase();
    owner = await createMember();
    resourceId = (await fixtures.createResource()).id;
    reservationId = (
      await createReservation(owner, resourceId, booking("09:00", "10:00"), NOW)
    ).id;
  });

  it("cancels, keeps the record, and frees the slot immediately", async () => {
    await cancelReservation(owner, reservationId, {}, NOW);

    expect(await rowOf(reservationId)).toMatchObject({
      status: "cancelled",
      cancelledAt: NOW,
      cancelledBy: owner.id,
      cancellationReason: null,
    });

    const other = await createMember();
    await expect(
      createReservation(other, resourceId, booking("09:00", "10:00"), NOW),
    ).resolves.toMatchObject({ status: "confirmed" });
  });

  it("refuses a second cancel and keeps the first cancellation's details", async () => {
    await cancelReservation(owner, reservationId, {}, NOW);
    const later = wallTimeToUtc("2030-01-14", "08:30");

    await expect(
      cancelReservation(owner, reservationId, {}, later),
    ).rejects.toMatchObject({ code: "ALREADY_CANCELLED" });
    expect((await rowOf(reservationId)).cancelledAt).toEqual(NOW);
  });

  it("lets only one of two simultaneous cancels take effect", async () => {
    const results = await Promise.allSettled([
      cancelReservation(owner, reservationId, {}, NOW),
      cancelReservation(owner, reservationId, {}, NOW),
    ]);

    const codes = results.map((r) =>
      r.status === "fulfilled"
        ? "ok"
        : r.reason instanceof DomainError
          ? r.reason.code
          : "unexpected",
    );
    expect(codes.sort()).toEqual(["ALREADY_CANCELLED", "ok"]);
  });

  it("refuses once the reservation has started (BR22)", async () => {
    const atStart = wallTimeToUtc(DATE, "09:00");

    await expect(
      cancelReservation(owner, reservationId, {}, atStart),
    ).rejects.toMatchObject({ code: "ALREADY_STARTED" });
    expect((await rowOf(reservationId)).status).toBe("confirmed");
  });

  it("tells another member the reservation does not exist", async () => {
    const other = await createMember();

    await expect(
      cancelReservation(other, reservationId, {}, NOW),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await rowOf(reservationId)).status).toBe("confirmed");
  });

  it("reports NOT_FOUND for an unknown id", async () => {
    await expect(
      cancelReservation(owner, randomUUID(), {}, NOW),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("listMyReservations (M8)", () => {
  it("groups the actor's own reservations into upcoming, past and cancelled", async () => {
    await fixtures.resetDatabase();
    const me = await createMember();
    const someoneElse = await createMember();
    const resourceId = (await fixtures.createResource()).id;

    const create = (
      actor: AuthenticatedUser,
      start: string,
      end: string,
      title: string,
    ) => createReservation(actor, resourceId, booking(start, end, title), NOW);

    await create(me, "09:00", "10:00", "Morning sync");
    await create(me, "11:00", "12:00", "Design review");
    await create(me, "14:00", "15:00", "Client call");
    const toCancel = await create(me, "16:00", "17:00", "Cancelled one");
    await create(someoneElse, "12:00", "13:00", "Not mine");
    await cancelReservation(me, toCancel.id, {}, NOW);

    // 11:30 on the day: the 09:00 meeting has ended, 11:00 is in progress.
    const midMorning = wallTimeToUtc(DATE, "11:30");
    const mine = await listMyReservations(me, midMorning);
    const titles = (list: { title: string }[]) => list.map((r) => r.title);

    expect(titles(mine.upcoming)).toEqual(["Design review", "Client call"]);
    expect(titles(mine.past)).toEqual(["Morning sync"]);
    expect(titles(mine.cancelled)).toEqual(["Cancelled one"]);
    expect(mine.cancelled[0].cancelledByOwner).toBe(true);
    expect(mine.upcoming[0].resourceName).toEqual(expect.any(String));
  });
});
