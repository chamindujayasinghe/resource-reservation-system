import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { notFound } from "next/navigation";

import { createReservationAction } from "@/actions/reservations";
import { BookingForm } from "@/components/booking-form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_ADVANCE_DAYS, ORGANIZATION_TIME_ZONE } from "@/domain/config";
import { buildDaySegments } from "@/domain/schedule";
import {
  addCalendarDays,
  calendarDateOf,
  formatCalendarDate,
  slotTimes,
} from "@/domain/time";
import { resourceTypeLabel } from "@/lib/resource-types";
import { cn } from "@/lib/utils";
import { requireUser } from "@/server/auth/session";
import { getDaySchedule } from "@/server/services/reservations";
import { scheduleSearchSchema } from "@/validation/reservations";
import { resourceIdSchema } from "@/validation/resources";

export const metadata: Metadata = { title: "Resource schedule" };

export default async function ResourcePage({
  params,
  searchParams,
}: PageProps<"/resources/[id]">) {
  const actor = await requireUser();
  const { id } = await params;

  const parsedId = resourceIdSchema.safeParse(id);
  if (!parsedId.success) {
    notFound();
  }

  // The server's clock and the organization's zone decide what "today" is.
  const now = new Date();
  const today = calendarDateOf(now);
  const { date: requestedDate } = scheduleSearchSchema.parse(
    await searchParams,
  );
  const date = requestedDate ?? today;

  // Members get not-found for an inactive resource; admins can view it.
  const schedule = await getDaySchedule(actor, parsedId.data, date);
  if (!schedule) {
    notFound();
  }
  const { resource, reservations } = schedule;

  const segments = buildDaySegments(date, reservations, now);
  const slots = slotTimes();
  const pagePath = `/resources/${resource.id}`;
  const dayLink = (day: string) => `${pagePath}?date=${day}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <Link
          href="/resources"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← All resources
        </Link>
        <h1 className="text-2xl font-semibold">{resource.name}</h1>
        <p className="text-muted-foreground">
          {resourceTypeLabel(resource.type)} · {resource.location}
          {resource.capacity ? ` · Capacity ${resource.capacity}` : ""}
        </p>
        {resource.description ? (
          <p className="text-sm">{resource.description}</p>
        ) : null}
      </div>

      {!resource.isActive ? (
        <Alert>
          <AlertDescription>
            This resource is inactive. Members cannot see or book it.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <section
          aria-labelledby="schedule-heading"
          className="flex flex-col gap-4"
        >
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 id="schedule-heading" className="text-lg font-semibold">
              {formatCalendarDate(date)}
              {date === today ? " (today)" : ""}
            </h2>
            <nav aria-label="Change day" className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link href={dayLink(addCalendarDays(date, -1))}>
                  ← Previous
                </Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={dayLink(today)}>Today</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <Link href={dayLink(addCalendarDays(date, 1))}>Next →</Link>
              </Button>
            </nav>
          </div>

          <Form action={pagePath} className="flex items-end gap-2">
            <div className="flex flex-col gap-2">
              <Label htmlFor="schedule-date">Go to date</Label>
              <Input
                // Previous/Next keep this page mounted; a new key per day
                // makes the field show the day being displayed.
                key={date}
                id="schedule-date"
                name="date"
                type="date"
                defaultValue={date}
                className="w-44"
              />
            </div>
            <Button type="submit" variant="secondary" size="sm">
              Show
            </Button>
          </Form>

          {reservations.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No reservations on this day.
            </p>
          ) : null}

          <ol className="flex flex-col divide-y rounded-lg border">
            {segments.map((segment) =>
              segment.kind === "booked" ? (
                <li
                  key={segment.booking.id}
                  className="flex flex-wrap gap-x-4 gap-y-1 bg-muted px-4 py-3"
                >
                  <span className="w-28 shrink-0 font-mono text-sm">
                    {segment.start}–{segment.end}
                  </span>
                  <span className="flex flex-col">
                    <span className="font-medium">{segment.booking.title}</span>
                    <span className="text-sm text-muted-foreground">
                      Booked by {segment.booking.ownerName}
                      {segment.booking.ownerId === actor.id ? " (you)" : ""}
                    </span>
                  </span>
                </li>
              ) : (
                <li
                  key={segment.start}
                  className={cn(
                    "flex gap-4 px-4 py-2 text-sm",
                    segment.isPast && "text-muted-foreground",
                  )}
                >
                  <span className="w-28 shrink-0 font-mono">
                    {segment.start}–{segment.end}
                  </span>
                  <span>{segment.isPast ? "Past" : "Free"}</span>
                </li>
              ),
            )}
          </ol>
          <p className="text-sm text-muted-foreground">
            All times are in {ORGANIZATION_TIME_ZONE} time.
          </p>
        </section>

        {resource.isActive ? (
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Book this resource</CardTitle>
            </CardHeader>
            <CardContent>
              <BookingForm
                // A new key per day resets the form when the day changes.
                key={date}
                action={createReservationAction.bind(null, resource.id)}
                initialValues={{ date: date < today ? today : date }}
                capacity={resource.capacity}
                submitLabel="Book"
                pendingLabel="Booking..."
                successMessage="Reservation confirmed."
                minDate={today}
                maxDate={addCalendarDays(today, MAX_ADVANCE_DAYS)}
                startTimes={slots.slice(0, -1)}
                endTimes={slots.slice(1)}
                timeZoneLabel={`${ORGANIZATION_TIME_ZONE} time`}
              />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  );
}
