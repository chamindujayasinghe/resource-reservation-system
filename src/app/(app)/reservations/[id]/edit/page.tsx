import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { updateReservationAction } from "@/actions/reservations";
import { BookingForm } from "@/components/booking-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MAX_ADVANCE_DAYS, ORGANIZATION_TIME_ZONE } from "@/domain/config";
import {
  addCalendarDays,
  calendarDateOf,
  formatTime,
  slotTimes,
} from "@/domain/time";
import { requireUser } from "@/server/auth/session";
import { getReservationForEdit } from "@/server/services/reservations";
import { reservationIdSchema } from "@/validation/reservations";

export const metadata: Metadata = { title: "Edit reservation" };

// S1. Only the owner can open this page, and only while the reservation is
// confirmed and has not started; anyone else gets not-found.
export default async function EditReservationPage({
  params,
}: PageProps<"/reservations/[id]/edit">) {
  const actor = await requireUser();
  const { id } = await params;

  const parsedId = reservationIdSchema.safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  const now = new Date();
  const reservation = await getReservationForEdit(actor, parsedId.data, now);
  if (!reservation) {
    notFound();
  }

  const today = calendarDateOf(now);
  const slots = slotTimes();
  // The id is fixed on the server; the form cannot change which reservation
  // it saves.
  const action = updateReservationAction.bind(null, reservation.id);

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Edit reservation</h1>
        <p className="text-sm text-muted-foreground">
          To use a different resource, cancel this reservation and book again.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{reservation.resourceName}</CardTitle>
        </CardHeader>
        <CardContent>
          <BookingForm
            action={action}
            initialValues={{
              date: calendarDateOf(reservation.startAt),
              start: formatTime(reservation.startAt),
              end: formatTime(reservation.endAt),
              title: reservation.title,
              attendeeCount: reservation.attendeeCount?.toString() ?? "",
            }}
            capacity={reservation.resourceCapacity}
            submitLabel="Save changes"
            pendingLabel="Saving..."
            successMessage="Reservation updated."
            successHref="/reservations"
            minDate={today}
            maxDate={addCalendarDays(today, MAX_ADVANCE_DAYS)}
            startTimes={slots.slice(0, -1)}
            endTimes={slots.slice(1)}
            timeZoneLabel={`${ORGANIZATION_TIME_ZONE} time`}
          />
        </CardContent>
      </Card>

      <Button asChild variant="ghost" className="self-start">
        <Link href="/reservations">Back to my reservations</Link>
      </Button>
    </div>
  );
}
