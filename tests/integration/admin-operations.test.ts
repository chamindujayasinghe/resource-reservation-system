import { and, eq, gt, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";

import { wallTimeToUtc } from "@/domain/time";
import { db } from "@/server/db/client";
import { reservations, resources, type UserRole } from "@/server/db/schema";
import {
  ADMIN_LIST_LIMIT,
  cancelReservation,
  createReservation,
  listAllReservations,
  listMyReservations,
} from "@/server/services/reservations";
import {
  countUpcomingReservations,
  deactivateResource,
  getResource,
  reactivateResource,
  RESOURCE_DEACTIVATED_REASON,
} from "@/server/services/resources";
import type { AuthenticatedUser } from "@/server/services/users";

import * as fixtures from "./helpers";

// "Now" is 10:30 Colombo time on the day of the bookings.
const DATE = "2030-01-15";
const at = (time: string, date = DATE) => wallTimeToUtc(date, time);
const NOW = at("10:30");

async function createActor(role: UserRole): Promise<AuthenticatedUser> {
  const user = await fixtures.createUser({ role });
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

// Inserts directly, bypassing the service, so past and in-progress
// reservations can exist relative to NOW.
async function insertReservation(values: {
  resourceId: string;
  userId: string;
  start: string;
  end: string;
  title?: string;
  date?: string;
}) {
  const [row] = await db
    .insert(reservations)
    .values({
      resourceId: values.resourceId,
      userId: values.userId,
      title: values.title ?? "Team meeting",
      startAt: at(values.start, values.date),
      endAt: at(values.end, values.date),
    })
    .returning();
  return row;
}

async function statusOf(id: string) {
  const [row] = await db
    .select()
    .from(reservations)
    .where(eq(reservations.id, id));
  return row;
}

describe("admin operations", () => {
  let admin: AuthenticatedUser;
  let member: AuthenticatedUser;
  let resourceId: string;

  beforeEach(async () => {
    await fixtures.resetDatabase();
    admin = await createActor("admin");
    member = await createActor("member");
    resourceId = (await fixtures.createResource({ name: "Boardroom" })).id;
  });

  describe("listAllReservations (M10)", () => {
    it("refuses members", async () => {
      await expect(
        listAllReservations(member, { from: DATE, to: DATE }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("filters by resource, status and date range, with names", async () => {
      const other = await fixtures.createResource({ name: "Van" });
      await insertReservation({
        resourceId,
        userId: member.id,
        start: "13:00",
        end: "14:00",
        title: "Planning",
      });
      await insertReservation({
        resourceId: other.id,
        userId: member.id,
        start: "13:00",
        end: "14:00",
        title: "Site visit",
      });
      await insertReservation({
        resourceId,
        userId: member.id,
        start: "09:00",
        end: "10:00",
        title: "Next week",
        date: "2030-01-22",
      });
      const toCancel = await insertReservation({
        resourceId,
        userId: member.id,
        start: "15:00",
        end: "16:00",
        title: "Dropped",
      });
      await cancelReservation(member, toCancel.id, {}, NOW);

      const titles = async (
        filters: Parameters<typeof listAllReservations>[1],
      ) => (await listAllReservations(admin, filters)).rows.map((r) => r.title);

      expect(await titles({ from: DATE, to: DATE })).toEqual([
        "Planning",
        "Site visit",
        "Dropped",
      ]);
      expect(await titles({ from: DATE, to: DATE, resourceId })).toEqual([
        "Planning",
        "Dropped",
      ]);
      expect(
        await titles({ from: DATE, to: DATE, status: "cancelled" }),
      ).toEqual(["Dropped"]);
      // A reversed range is swapped.
      expect(
        await titles({ from: "2030-01-22", to: DATE, resourceId }),
      ).toEqual(["Planning", "Dropped", "Next week"]);

      const [first] = (
        await listAllReservations(admin, { from: DATE, to: DATE })
      ).rows;
      expect(first).toMatchObject({
        resourceName: "Boardroom",
        ownerName: member.name,
      });
    });

    it(`returns at most ${ADMIN_LIST_LIMIT} rows and says there are more`, async () => {
      // ADMIN_LIST_LIMIT + 1 back-to-back half hours from midnight UTC.
      const base = new Date("2030-01-15T00:00:00Z").getTime();
      const halfHour = 30 * 60 * 1000;
      await db.insert(reservations).values(
        Array.from({ length: ADMIN_LIST_LIMIT + 1 }, (_, i) => ({
          resourceId,
          userId: member.id,
          title: `Booking ${i}`,
          startAt: new Date(base + i * halfHour),
          endAt: new Date(base + (i + 1) * halfHour),
        })),
      );

      const result = await listAllReservations(admin, {
        from: "2030-01-14",
        to: "2030-01-20",
      });

      expect(result.rows).toHaveLength(ADMIN_LIST_LIMIT);
      expect(result.hasMore).toBe(true);
    });
  });

  describe("admin cancel (M10, BR23)", () => {
    let membersReservationId: string;

    beforeEach(async () => {
      membersReservationId = (
        await insertReservation({
          resourceId,
          userId: member.id,
          start: "13:00",
          end: "14:00",
        })
      ).id;
    });

    it("requires a reason for someone else's reservation and changes nothing without one", async () => {
      await expect(
        cancelReservation(admin, membersReservationId, {}, NOW),
      ).rejects.toMatchObject({ code: "VALIDATION", field: "reason" });
      await expect(
        cancelReservation(admin, membersReservationId, { reason: "   " }, NOW),
      ).rejects.toMatchObject({ code: "VALIDATION", field: "reason" });
      expect((await statusOf(membersReservationId)).status).toBe("confirmed");
    });

    it("records who, when and why, and the owner sees it", async () => {
      await cancelReservation(
        admin,
        membersReservationId,
        { reason: "Room needed for an audit" },
        NOW,
      );

      expect(await statusOf(membersReservationId)).toMatchObject({
        status: "cancelled",
        cancelledBy: admin.id,
        cancelledAt: NOW,
        cancellationReason: "Room needed for an audit",
      });

      const { cancelled } = await listMyReservations(member, NOW);
      expect(cancelled[0]).toMatchObject({
        cancelledByOwner: false,
        cancellationReason: "Room needed for an audit",
      });
    });

    it("lets an admin cancel their own reservation without a reason", async () => {
      const own = await insertReservation({
        resourceId,
        userId: admin.id,
        start: "15:00",
        end: "16:00",
      });

      await cancelReservation(admin, own.id, {}, NOW);

      expect((await statusOf(own.id)).status).toBe("cancelled");
    });

    it("refuses a reservation that has started, even for an admin", async () => {
      const inProgress = await insertReservation({
        resourceId,
        userId: member.id,
        start: "10:00",
        end: "11:00",
      });

      await expect(
        cancelReservation(admin, inProgress.id, { reason: "Too late" }, NOW),
      ).rejects.toMatchObject({ code: "ALREADY_STARTED" });
    });

    it("does not let a member cancel someone else's by giving a reason", async () => {
      const otherMember = await createActor("member");

      await expect(
        cancelReservation(
          otherMember,
          membersReservationId,
          { reason: "Mine now" },
          NOW,
        ),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect((await statusOf(membersReservationId)).status).toBe("confirmed");
    });
  });

  describe("deactivation (M4, BR18)", () => {
    it("cancels only reservations that have not started, and reports how many", async () => {
      const past = await insertReservation({
        resourceId,
        userId: member.id,
        start: "08:00",
        end: "09:00",
      });
      const inProgress = await insertReservation({
        resourceId,
        userId: member.id,
        start: "10:00",
        end: "11:00",
      });
      const later = await insertReservation({
        resourceId,
        userId: member.id,
        start: "13:00",
        end: "14:00",
      });
      const tomorrow = await insertReservation({
        resourceId,
        userId: member.id,
        start: "09:00",
        end: "10:00",
        date: "2030-01-16",
      });

      expect(
        (await countUpcomingReservations(admin, NOW)).get(resourceId),
      ).toBe(2);

      const result = await deactivateResource(admin, resourceId, NOW);

      expect(result).toEqual({ cancelledCount: 2 });
      expect((await getResource(admin, resourceId))?.isActive).toBe(false);
      expect((await statusOf(past.id)).status).toBe("confirmed");
      expect((await statusOf(inProgress.id)).status).toBe("confirmed");
      for (const id of [later.id, tomorrow.id]) {
        expect(await statusOf(id)).toMatchObject({
          status: "cancelled",
          cancelledBy: admin.id,
          cancellationReason: RESOURCE_DEACTIVATED_REASON,
        });
      }
    });

    it("refuses new bookings while inactive, and reactivation restores booking but not cancelled reservations", async () => {
      const later = await insertReservation({
        resourceId,
        userId: member.id,
        start: "13:00",
        end: "14:00",
      });
      await deactivateResource(admin, resourceId, NOW);

      const booking = {
        date: DATE,
        start: "15:00",
        end: "16:00",
        title: "Retro",
      };
      await expect(
        createReservation(member, resourceId, booking, NOW),
      ).rejects.toMatchObject({ code: "RESOURCE_INACTIVE" });

      await reactivateResource(admin, resourceId);

      await expect(
        createReservation(member, resourceId, booking, NOW),
      ).resolves.toMatchObject({ status: "confirmed" });
      expect((await statusOf(later.id)).status).toBe("cancelled");
    });

    it("refuses members", async () => {
      await expect(
        deactivateResource(member, resourceId, NOW),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        reactivateResource(member, resourceId),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(
        countUpcomingReservations(member, NOW),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("never leaves a confirmed future reservation on an inactive resource when booking and deactivation race", async () => {
      const ROUNDS = 10;
      const booking = {
        date: DATE,
        start: "13:00",
        end: "14:00",
        title: "Race",
      };

      for (let round = 0; round < ROUNDS; round++) {
        const raced = await fixtures.createResource();

        const [bookingResult] = await Promise.allSettled([
          createReservation(member, raced.id, booking, NOW),
          deactivateResource(admin, raced.id, NOW),
        ]);

        // The booking either landed first (and was then cancelled) or was
        // refused because the resource was already inactive.
        if (bookingResult.status === "rejected") {
          expect(bookingResult.reason).toMatchObject({
            code: "RESOURCE_INACTIVE",
          });
        }
      }

      const [orphans] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(reservations)
        .innerJoin(resources, eq(resources.id, reservations.resourceId))
        .where(
          and(
            eq(resources.isActive, false),
            eq(reservations.status, "confirmed"),
            gt(reservations.startAt, NOW),
          ),
        );
      expect(orphans.count).toBe(0);
    });
  });
});
