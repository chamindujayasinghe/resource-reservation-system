import { and, asc, eq, gt, lt } from "drizzle-orm";

import { checkReservationTimes } from "@/domain/reservation-rules";
import { dayBoundsUtc, formatTime } from "@/domain/time";
import { db } from "@/server/db/client";
import { reservations, resources, users } from "@/server/db/schema";
import { DomainError, findPgError, mapDbError } from "@/server/errors";
import type { ReservationInput } from "@/validation/reservations";

import { getResource, type Resource } from "./resources";
import type { AuthenticatedUser } from "./users";

export type Reservation = typeof reservations.$inferSelect;

// A confirmed booking as shown on a resource's schedule. Every signed-in user
// may see who booked and why (scope assumption 15).
export type ScheduledReservation = {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date;
  ownerId: string;
  ownerName: string;
};

// Deadlock and serialization failure: safe to retry, because the transaction
// that failed was rolled back in full (plan 5.3).
const RETRYABLE_SQLSTATES = new Set(["40P01", "40001"]);

async function withOneRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const code = findPgError(error)?.code;
    if (code && RETRYABLE_SQLSTATES.has(code)) {
      return operation();
    }
    throw error;
  }
}

// Ranges are half-open [start, end): two ranges overlap when each starts
// before the other ends, so back-to-back bookings do not (BR9).
const overlapsRange = (startAt: Date, endAt: Date) =>
  and(lt(reservations.startAt, endAt), gt(reservations.endAt, startAt));

// M6 and M7. The owner is always the actor, never a value from the form.
export async function createReservation(
  actor: AuthenticatedUser,
  resourceId: string,
  input: ReservationInput,
  now: Date = new Date(),
): Promise<Reservation> {
  const times = checkReservationTimes(input, now);
  if (!times.ok) {
    throw new DomainError("VALIDATION", times.violation.message, {
      field: times.violation.field,
    });
  }
  const { startAt, endAt } = times;

  try {
    return await withOneRetry(() =>
      db.transaction(async (tx) => {
        // Lock the resource row. Bookings for the same resource now queue
        // here, and a deactivation (which takes the same lock) cannot slip
        // in between the active check and the insert.
        const [resource] = await tx
          .select({ isActive: resources.isActive })
          .from(resources)
          .where(eq(resources.id, resourceId))
          .for("update");

        if (!resource) {
          throw new DomainError("NOT_FOUND", "That resource does not exist.");
        }
        // BR12, checked at the moment of booking.
        if (!resource.isActive) {
          throw new DomainError(
            "RESOURCE_INACTIVE",
            "This resource is no longer available for booking.",
          );
        }

        // For a helpful message only. The guarantee is the exclusion
        // constraint, which refuses the insert even if this check is
        // ever skipped.
        const [conflict] = await tx
          .select({
            startAt: reservations.startAt,
            endAt: reservations.endAt,
          })
          .from(reservations)
          .where(
            and(
              eq(reservations.resourceId, resourceId),
              eq(reservations.status, "confirmed"),
              overlapsRange(startAt, endAt),
            ),
          )
          .orderBy(asc(reservations.startAt))
          .limit(1);

        if (conflict) {
          throw new DomainError(
            "SLOT_TAKEN",
            `This overlaps an existing reservation from ${formatTime(conflict.startAt)} to ${formatTime(conflict.endAt)}.`,
          );
        }

        const [created] = await tx
          .insert(reservations)
          .values({
            resourceId,
            userId: actor.id,
            title: input.title,
            startAt,
            endAt,
          })
          .returning();

        return created;
      }),
    );
  } catch (error) {
    // A violation of reservations_no_overlap becomes SLOT_TAKEN. A
    // DomainError thrown above passes through unchanged.
    throw mapDbError(error) ?? error;
  }
}

// One of the actor's own reservations, as listed in "My reservations".
export type MyReservation = {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date;
  status: Reservation["status"];
  cancellationReason: string | null;
  cancelledByOwner: boolean;
  resourceId: string;
  resourceName: string;
};

export type MyReservations = {
  upcoming: MyReservation[];
  past: MyReservation[];
  cancelled: MyReservation[];
};

// M8. "Upcoming" and "past" are derived from the current time, never stored
// (scope assumption 13). An in-progress reservation counts as upcoming.
export async function listMyReservations(
  actor: AuthenticatedUser,
  now: Date = new Date(),
): Promise<MyReservations> {
  const rows = await db
    .select({
      id: reservations.id,
      title: reservations.title,
      startAt: reservations.startAt,
      endAt: reservations.endAt,
      status: reservations.status,
      cancelledBy: reservations.cancelledBy,
      cancellationReason: reservations.cancellationReason,
      resourceId: resources.id,
      resourceName: resources.name,
    })
    .from(reservations)
    .innerJoin(resources, eq(resources.id, reservations.resourceId))
    .where(eq(reservations.userId, actor.id))
    .orderBy(asc(reservations.startAt));

  const mine: MyReservation[] = rows.map(({ cancelledBy, ...row }) => ({
    ...row,
    cancelledByOwner: cancelledBy === actor.id,
  }));
  const hasEnded = (r: MyReservation) => r.endAt.getTime() <= now.getTime();

  return {
    upcoming: mine.filter((r) => r.status === "confirmed" && !hasEnded(r)),
    past: mine.filter((r) => r.status === "confirmed" && hasEnded(r)).reverse(),
    cancelled: mine.filter((r) => r.status === "cancelled").reverse(),
  };
}

// M9: the owner cancels a reservation that has not started. One conditional
// update, so a double click or a second tab cannot cancel twice: the second
// attempt matches no row and is told why. The row is kept (BR26).
export async function cancelReservation(
  actor: AuthenticatedUser,
  reservationId: string,
  now: Date = new Date(),
): Promise<void> {
  const cancelled = await db
    .update(reservations)
    .set({ status: "cancelled", cancelledAt: now, cancelledBy: actor.id })
    .where(
      and(
        eq(reservations.id, reservationId),
        eq(reservations.userId, actor.id),
        eq(reservations.status, "confirmed"),
        gt(reservations.startAt, now),
      ),
    )
    .returning({ id: reservations.id });

  if (cancelled.length > 0) {
    return;
  }

  // Nothing changed: find out why, to give a useful message.
  const [existing] = await db
    .select({
      userId: reservations.userId,
      status: reservations.status,
    })
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .limit(1);

  // Someone else's reservation looks the same as a missing one, so ids
  // cannot be probed.
  if (!existing || existing.userId !== actor.id) {
    throw new DomainError("NOT_FOUND", "That reservation does not exist.");
  }
  if (existing.status === "cancelled") {
    throw new DomainError(
      "ALREADY_CANCELLED",
      "This reservation is already cancelled.",
    );
  }
  // BR22
  throw new DomainError(
    "ALREADY_STARTED",
    "This reservation has already started, so it can no longer be cancelled.",
  );
}

// M5. The resource and its confirmed bookings on one calendar day in the
// organization's time zone, or null if the actor may not see the resource.
export async function getDaySchedule(
  actor: AuthenticatedUser,
  resourceId: string,
  date: string,
): Promise<{
  resource: Resource;
  reservations: ScheduledReservation[];
} | null> {
  const resource = await getResource(actor, resourceId);
  if (!resource) {
    return null;
  }

  const day = dayBoundsUtc(date);
  const rows = await db
    .select({
      id: reservations.id,
      title: reservations.title,
      startAt: reservations.startAt,
      endAt: reservations.endAt,
      ownerId: reservations.userId,
      ownerName: users.name,
    })
    .from(reservations)
    .innerJoin(users, eq(users.id, reservations.userId))
    .where(
      and(
        eq(reservations.resourceId, resourceId),
        eq(reservations.status, "confirmed"),
        overlapsRange(day.start, day.end),
      ),
    )
    .orderBy(asc(reservations.startAt));

  return { resource, reservations: rows };
}
