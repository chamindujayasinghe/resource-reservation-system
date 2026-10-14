import { randomUUID } from "node:crypto";

import { and, eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { minutesToTime, timeToMinutes, wallTimeToUtc } from "@/domain/time";
import { db } from "@/server/db/client";
import { reservations } from "@/server/db/schema";
import { DomainError } from "@/server/errors";
import { createReservation } from "@/server/services/reservations";
import type { AuthenticatedUser } from "@/server/services/users";

import * as fixtures from "./helpers";

// A fixed clock keeps every test independent of when it runs: "now" is 08:00
// Colombo time the day before the bookings.
const NOW = wallTimeToUtc("2030-01-14", "08:00");
const DATE = "2030-01-15";

const PARALLEL_REQUESTS = 10;
const REPEATS = 5;

async function createMember(): Promise<AuthenticatedUser> {
  const user = await fixtures.createUser({ role: "member" });
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

const booking = (start: string, end: string, title = "Team meeting") => ({
  date: DATE,
  start,
  end,
  title,
  attendeeCount: null,
});

async function confirmedCount(resourceId: string): Promise<number> {
  const rows = await db
    .select({ id: reservations.id })
    .from(reservations)
    .where(
      and(
        eq(reservations.resourceId, resourceId),
        eq(reservations.status, "confirmed"),
      ),
    );
  return rows.length;
}

// Pairs of confirmed reservations on the same resource whose ranges overlap.
// Must always be zero.
async function overlappingPairs(): Promise<number> {
  const result = await db.execute<{ count: string }>(sql`
    select count(*) as count
    from reservations a
    join reservations b
      on a.resource_id = b.resource_id
     and a.id < b.id
     and a.status = 'confirmed'
     and b.status = 'confirmed'
     and tstzrange(a.start_at, a.end_at, '[)') && tstzrange(b.start_at, b.end_at, '[)')
  `);
  return Number(result.rows[0]?.count);
}

function codeOf(reason: unknown): string | undefined {
  return reason instanceof DomainError ? reason.code : undefined;
}

describe("createReservation", () => {
  let member: AuthenticatedUser;
  let resourceId: string;

  beforeEach(async () => {
    await fixtures.resetDatabase();
    member = await createMember();
    resourceId = (await fixtures.createResource()).id;
  });

  describe("concurrency (M7, plan 6.2 group B)", () => {
    it(`lets exactly one of ${PARALLEL_REQUESTS} simultaneous requests for the same slot succeed`, async () => {
      const members = await Promise.all(
        Array.from({ length: PARALLEL_REQUESTS }, createMember),
      );

      for (let round = 0; round < REPEATS; round++) {
        await db.delete(reservations);

        const results = await Promise.allSettled(
          members.map((actor) =>
            createReservation(
              actor,
              resourceId,
              booking("09:00", "10:00"),
              NOW,
            ),
          ),
        );

        const fulfilled = results.filter((r) => r.status === "fulfilled");
        const rejectionCodes = results.flatMap((r) =>
          r.status === "rejected" ? [codeOf(r.reason)] : [],
        );

        expect(fulfilled).toHaveLength(1);
        expect(rejectionCodes).toEqual(
          Array(PARALLEL_REQUESTS - 1).fill("SLOT_TAKEN"),
        );
        expect(await confirmedCount(resourceId)).toBe(1);
      }
    });

    it("never confirms two overlapping reservations from partly overlapping simultaneous requests", async () => {
      const members = await Promise.all(
        Array.from({ length: PARALLEL_REQUESTS }, createMember),
      );

      for (let round = 0; round < REPEATS; round++) {
        await db.delete(reservations);

        // 09:00-10:00, 09:30-10:30, 10:00-11:00, ... 13:30-14:30
        const results = await Promise.allSettled(
          members.map((actor, i) => {
            const start = timeToMinutes("09:00") + i * 30;
            return createReservation(
              actor,
              resourceId,
              booking(minutesToTime(start), minutesToTime(start + 60)),
              NOW,
            );
          }),
        );

        const rejectionCodes = results.flatMap((r) =>
          r.status === "rejected" ? [codeOf(r.reason)] : [],
        );

        expect(results.some((r) => r.status === "fulfilled")).toBe(true);
        expect(rejectionCodes.every((code) => code === "SLOT_TAKEN")).toBe(
          true,
        );
        expect(await overlappingPairs()).toBe(0);
      }
    });
  });

  describe("behaviour (plan 6.2 group C)", () => {
    it("books a free slot with the actor as owner", async () => {
      const created = await createReservation(
        member,
        resourceId,
        booking("09:00", "10:00", "  Sprint planning  "),
        NOW,
      );

      expect(created).toMatchObject({
        resourceId,
        userId: member.id,
        status: "confirmed",
        startAt: wallTimeToUtc(DATE, "09:00"),
        endAt: wallTimeToUtc(DATE, "10:00"),
      });
    });

    it("refuses an overlap with a message naming the existing booking", async () => {
      await createReservation(
        member,
        resourceId,
        booking("09:00", "10:00"),
        NOW,
      );

      await expect(
        createReservation(member, resourceId, booking("09:30", "10:30"), NOW),
      ).rejects.toMatchObject({
        code: "SLOT_TAKEN",
        message: "This overlaps an existing reservation from 09:00 to 10:00.",
      });
    });

    it("allows back-to-back bookings (BR9)", async () => {
      await createReservation(
        member,
        resourceId,
        booking("09:00", "10:00"),
        NOW,
      );
      await createReservation(
        member,
        resourceId,
        booking("10:00", "11:00"),
        NOW,
      );

      expect(await confirmedCount(resourceId)).toBe(2);
    });

    it("refuses an inactive resource (BR12)", async () => {
      const inactive = await fixtures.createResource({ isActive: false });

      await expect(
        createReservation(member, inactive.id, booking("09:00", "10:00"), NOW),
      ).rejects.toMatchObject({ code: "RESOURCE_INACTIVE" });
    });

    it("refuses a resource that does not exist", async () => {
      await expect(
        createReservation(member, randomUUID(), booking("09:00", "10:00"), NOW),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("reports a broken time rule on the right field and saves nothing", async () => {
      await expect(
        createReservation(member, resourceId, booking("06:30", "08:00"), NOW),
      ).rejects.toMatchObject({ code: "VALIDATION", field: "start" });
      expect(await confirmedCount(resourceId)).toBe(0);
    });
  });

  describe("attendee count (S2, BR16)", () => {
    const withAttendees = (attendeeCount: number) => ({
      ...booking("09:00", "10:00"),
      attendeeCount,
    });

    it("refuses more attendees than the capacity and saves nothing", async () => {
      const room = await fixtures.createResource({ capacity: 6 });

      await expect(
        createReservation(member, room.id, withAttendees(7), NOW),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        field: "attendeeCount",
        message: "This resource holds at most 6 people.",
      });
      expect(await confirmedCount(room.id)).toBe(0);
    });

    it("accepts attendees equal to the capacity and stores the count", async () => {
      const room = await fixtures.createResource({ capacity: 6 });

      await expect(
        createReservation(member, room.id, withAttendees(6), NOW),
      ).resolves.toMatchObject({ attendeeCount: 6 });
    });

    it("accepts any count when the resource has no capacity", async () => {
      const projector = await fixtures.createResource({ capacity: null });

      await expect(
        createReservation(member, projector.id, withAttendees(40), NOW),
      ).resolves.toMatchObject({ attendeeCount: 40 });
    });
  });
});
