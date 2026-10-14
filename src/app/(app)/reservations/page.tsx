import type { Metadata } from "next";
import Link from "next/link";

import { cancelReservationAction } from "@/actions/reservations";
import { CancelReservationDialog } from "@/components/cancel-reservation-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ORGANIZATION_TIME_ZONE } from "@/domain/config";
import { hasStarted } from "@/domain/reservation-rules";
import { calendarDateOf, formatCalendarDate, formatTime } from "@/domain/time";
import { requireUser } from "@/server/auth/session";
import {
  listMyReservations,
  type MyReservation,
} from "@/server/services/reservations";

export const metadata: Metadata = { title: "My reservations" };

export default async function MyReservationsPage() {
  const actor = await requireUser();
  const now = new Date();
  const { upcoming, past, cancelled } = await listMyReservations(actor, now);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">My reservations</h1>
        <Button asChild variant="outline">
          <Link href="/resources">Book a resource</Link>
        </Button>
      </div>

      <Section
        title="Upcoming"
        empty="You have no upcoming reservations."
        reservations={upcoming}
        render={(reservation) => {
          const inProgress = hasStarted(reservation.startAt, now);
          return (
            <ReservationItem reservation={reservation}>
              {inProgress ? (
                <Badge variant="secondary">In progress</Badge>
              ) : (
                <CancelReservationDialog
                  action={cancelReservationAction.bind(null, reservation.id)}
                  summary={describe(reservation)}
                />
              )}
            </ReservationItem>
          );
        }}
      />

      <Section
        title="Past"
        empty="No past reservations yet."
        reservations={past}
        render={(reservation) => (
          <ReservationItem reservation={reservation}>
            <Badge variant="outline">Completed</Badge>
          </ReservationItem>
        )}
      />

      <Section
        title="Cancelled"
        empty="No cancelled reservations."
        reservations={cancelled}
        render={(reservation) => (
          <ReservationItem reservation={reservation}>
            <Badge variant="outline">Cancelled</Badge>
            <p className="basis-full text-sm text-muted-foreground">
              Cancelled by{" "}
              {reservation.cancelledByOwner ? "you" : "an administrator"}
              {reservation.cancellationReason
                ? `: ${reservation.cancellationReason}`
                : "."}
            </p>
          </ReservationItem>
        )}
      />

      <p className="text-sm text-muted-foreground">
        All times are in {ORGANIZATION_TIME_ZONE} time.
      </p>
    </div>
  );
}

function dateOf(reservation: MyReservation): string {
  return calendarDateOf(reservation.startAt);
}

function timeRangeOf(reservation: MyReservation): string {
  return `${formatTime(reservation.startAt)}–${formatTime(reservation.endAt)}`;
}

// e.g. "Sprint planning, Boardroom, Wed 14 Oct 2026, 09:00–11:00"
function describe(reservation: MyReservation): string {
  return `${reservation.title}, ${reservation.resourceName}, ${formatCalendarDate(dateOf(reservation))}, ${timeRangeOf(reservation)}`;
}

function Section({
  title,
  empty,
  reservations,
  render,
}: {
  title: string;
  empty: string;
  reservations: MyReservation[];
  render: (reservation: MyReservation) => React.ReactNode;
}) {
  const headingId = `${title.toLowerCase()}-heading`;

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3">
      <h2 id={headingId} className="text-lg font-semibold">
        {title}{" "}
        <span className="font-normal text-muted-foreground">
          ({reservations.length})
        </span>
      </h2>
      {reservations.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <ul className="flex flex-col divide-y rounded-lg border">
          {reservations.map((reservation) => (
            <li key={reservation.id}>{render(reservation)}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ReservationItem({
  reservation,
  children,
}: {
  reservation: MyReservation;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
      <div className="flex min-w-48 flex-1 flex-col">
        <span className="font-medium">{reservation.title}</span>
        <span className="text-sm text-muted-foreground">
          <Link
            href={`/resources/${reservation.resourceId}?date=${dateOf(reservation)}`}
            className="underline-offset-2 hover:underline"
          >
            {reservation.resourceName}
          </Link>
          {" · "}
          {formatCalendarDate(dateOf(reservation))}
          {" · "}
          <span className="font-mono">{timeRangeOf(reservation)}</span>
        </span>
      </div>
      {children}
    </div>
  );
}
