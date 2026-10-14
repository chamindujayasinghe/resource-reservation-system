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
