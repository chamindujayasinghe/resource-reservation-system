import { and, asc, eq, gt, lt } from "drizzle-orm";

import { checkReservationTimes, hasStarted } from "@/domain/reservation-rules";
import { dayBoundsUtc, formatTime } from "@/domain/time";
import { db } from "@/server/db/client";
import { reservations, resources, users } from "@/server/db/schema";
import { DomainError, findPgError, mapDbError } from "@/server/errors";
import type { ReservationInput } from "@/validation/reservations";

import { assertAdmin } from "./authorization";
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

// A row of the admin's list of all reservations (M10).
export type AdminReservationRow = {
  id: string;
  title: string;
  startAt: Date;
  endAt: Date;
  status: Reservation["status"];
  cancellationReason: string | null;
  resourceId: string;
  resourceName: string;
  ownerName: string;
};

export const ADMIN_LIST_LIMIT = 100;

// M10. Admin only. Reservations overlapping a range of calendar days in the
// organization's time zone, optionally for one resource or status. At most
// ADMIN_LIST_LIMIT rows; hasMore says the filters should be narrowed.
export async function listAllReservations(
  actor: AuthenticatedUser,
  filters: {
    resourceId?: string;
    status?: Reservation["status"];
    from: string;
    to: string;
  },
): Promise<{ rows: AdminReservationRow[]; hasMore: boolean }> {
  assertAdmin(actor);

  // A reversed range is swapped rather than returning nothing.
  const [firstDay, lastDay] =
    filters.from <= filters.to
      ? [filters.from, filters.to]
      : [filters.to, filters.from];
  const rangeStart = dayBoundsUtc(firstDay).start;
  const rangeEnd = dayBoundsUtc(lastDay).end;

  const rows = await db
    .select({
      id: reservations.id,
      title: reservations.title,
      startAt: reservations.startAt,
      endAt: reservations.endAt,
      status: reservations.status,
      cancellationReason: reservations.cancellationReason,
      resourceId: resources.id,
      resourceName: resources.name,
      ownerName: users.name,
    })
    .from(reservations)
    .innerJoin(resources, eq(resources.id, reservations.resourceId))
    .innerJoin(users, eq(users.id, reservations.userId))
    .where(
      and(
        overlapsRange(rangeStart, rangeEnd),
        filters.resourceId
          ? eq(reservations.resourceId, filters.resourceId)
          : undefined,
        filters.status ? eq(reservations.status, filters.status) : undefined,
      ),
    )
    .orderBy(asc(reservations.startAt), asc(resources.name))
    // One extra row tells us whether there are more than the limit.
    .limit(ADMIN_LIST_LIMIT + 1);

  return {
    rows: rows.slice(0, ADMIN_LIST_LIMIT),
    hasMore: rows.length > ADMIN_LIST_LIMIT,
  };
}

// M9 and M10. The owner may cancel their own reservation; an admin may cancel
// anyone's, but must give a reason when it is not their own (BR23). Only a
// reservation that has not started can be cancelled (BR22).
//
// One conditional update, so a double click, a second tab, or an owner and an
// admin at the same moment cannot cancel twice: the second attempt matches no
// row and is told why. The row is kept with who, when and why (BR26).
export async function cancelReservation(
  actor: AuthenticatedUser,
  reservationId: string,
  options: { reason?: string | null } = {},
  now: Date = new Date(),
): Promise<void> {
  const reason = options.reason?.trim() || null;
  const isAdmin = actor.role === "admin";
  // Without a reason, even an admin can only cancel their own reservation.
  const mayCancelOthers = isAdmin && reason !== null;

  const cancelled = await db
    .update(reservations)
    .set({
      status: "cancelled",
      cancelledAt: now,
      cancelledBy: actor.id,
      cancellationReason: reason,
    })
    .where(
      and(
        eq(reservations.id, reservationId),
        mayCancelOthers ? undefined : eq(reservations.userId, actor.id),
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
      startAt: reservations.startAt,
    })
    .from(reservations)
    .where(eq(reservations.id, reservationId))
    .limit(1);
  const isOwn = existing?.userId === actor.id;

  // To a member, someone else's reservation looks the same as a missing one,
  // so ids cannot be probed.
  if (!existing || (!isOwn && !isAdmin)) {
    throw new DomainError("NOT_FOUND", "That reservation does not exist.");
  }
  if (existing.status === "cancelled") {
    throw new DomainError(
      "ALREADY_CANCELLED",
      "This reservation is already cancelled.",
    );
  }
  if (hasStarted(existing.startAt, now)) {
    throw new DomainError(
      "ALREADY_STARTED",
      "This reservation has already started, so it can no longer be cancelled.",
    );
  }
  // The only case left: an admin cancelling someone else's without a reason.
  throw new DomainError(
    "VALIDATION",
    "Give a reason. The owner will see it in their reservations.",
    { field: "reason" },
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
