import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";

import { adminCancelReservationAction } from "@/actions/reservations";
import { CancelReservationDialog } from "@/components/cancel-reservation-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ORGANIZATION_TIME_ZONE } from "@/domain/config";
import { hasStarted } from "@/domain/reservation-rules";
import {
  addCalendarDays,
  calendarDateOf,
  formatCalendarDate,
  formatTime,
} from "@/domain/time";
import { requireAdmin } from "@/server/auth/session";
import {
  ADMIN_LIST_LIMIT,
  listAllReservations,
} from "@/server/services/reservations";
import { listResources } from "@/server/services/resources";
import { adminReservationFiltersSchema } from "@/validation/reservations";

export const metadata: Metadata = { title: "All reservations" };

const LIST_PATH = "/admin/reservations";
// Without filters, the list shows today and the next 30 days (plan 4.3).
const DEFAULT_RANGE_DAYS = 30;

export default async function AdminReservationsPage({
  searchParams,
}: PageProps<"/admin/reservations">) {
  const actor = await requireAdmin();
  const now = new Date();
  const today = calendarDateOf(now);

  const filters = adminReservationFiltersSchema.parse(await searchParams);
  const from = filters.from ?? today;
  const to = filters.to ?? addCalendarDays(today, DEFAULT_RANGE_DAYS);

  const [{ rows, hasMore }, allResources] = await Promise.all([
    listAllReservations(actor, {
      resourceId: filters.resource,
      status: filters.status,
      from,
      to,
    }),
    listResources(actor, { includeInactive: true }),
  ]);
  const isFiltered = Boolean(
    filters.resource || filters.status || filters.from || filters.to,
  );

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">All reservations</h1>

      <Form
        action={LIST_PATH}
        role="search"
        className="flex flex-wrap items-end gap-3"
      >
        <div className="flex w-56 flex-col gap-2">
          <Label htmlFor="resource">Resource</Label>
          <NativeSelect
            id="resource"
            name="resource"
            defaultValue={filters.resource ?? ""}
          >
            <option value="">All resources</option>
            {allResources.map((resource) => (
              <option key={resource.id} value={resource.id}>
                {resource.name}
                {resource.isActive ? "" : " (inactive)"}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex w-40 flex-col gap-2">
          <Label htmlFor="status">Status</Label>
          <NativeSelect
            id="status"
            name="status"
            defaultValue={filters.status ?? ""}
          >
            <option value="">All statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="cancelled">Cancelled</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="from">From</Label>
          <Input
            id="from"
            name="from"
            type="date"
            defaultValue={from}
            className="w-44"
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="to">To</Label>
          <Input
            id="to"
            name="to"
            type="date"
            defaultValue={to}
            className="w-44"
          />
        </div>
        <Button type="submit" variant="secondary">
          Apply
        </Button>
        {isFiltered ? (
          <Button asChild variant="ghost">
            <Link href={LIST_PATH}>Reset</Link>
          </Button>
        ) : null}
      </Form>

      {hasMore ? (
        <p className="text-sm text-muted-foreground">
          Showing the first {ADMIN_LIST_LIMIT}. Narrow the filters to see the
          rest.
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <p className="font-medium">No reservations match these filters.</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Showing {formatCalendarDate(from)} to {formatCalendarDate(to)}.
          </p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Date</TableHead>
              <TableHead>Time</TableHead>
              <TableHead>Resource</TableHead>
              <TableHead>Booked by</TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>
                <span className="sr-only">Actions</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const date = calendarDateOf(row.startAt);
              const time = `${formatTime(row.startAt)}–${formatTime(row.endAt)}`;
              const started = hasStarted(row.startAt, now);

              return (
                <TableRow key={row.id}>
                  <TableCell>{formatCalendarDate(date)}</TableCell>
                  <TableCell className="font-mono">{time}</TableCell>
                  <TableCell>
                    <Link
                      href={`/resources/${row.resourceId}?date=${date}`}
                      className="underline-offset-2 hover:underline"
                    >
                      {row.resourceName}
                    </Link>
                  </TableCell>
                  <TableCell>{row.ownerName}</TableCell>
                  <TableCell className="max-w-56 whitespace-normal">
                    {row.title}
                  </TableCell>
                  <TableCell className="max-w-56 whitespace-normal">
                    {row.status === "cancelled" ? (
                      <div className="flex flex-col gap-1">
                        <Badge variant="outline">Cancelled</Badge>
                        {row.cancellationReason ? (
                          <span className="text-xs text-muted-foreground">
                            {row.cancellationReason}
                          </span>
                        ) : null}
                      </div>
                    ) : started ? (
                      <Badge variant="secondary">
                        {row.endAt.getTime() > now.getTime()
                          ? "In progress"
                          : "Completed"}
                      </Badge>
                    ) : (
                      <Badge>Confirmed</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {row.status === "confirmed" && !started ? (
                      <CancelReservationDialog
                        action={adminCancelReservationAction.bind(null, row.id)}
                        summary={`${row.title}, ${row.resourceName}, booked by ${row.ownerName}, ${formatCalendarDate(date)}, ${time}`}
                        requireReason
                      />
                    ) : null}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <p className="text-sm text-muted-foreground">
        All times are in {ORGANIZATION_TIME_ZONE} time.
      </p>
    </div>
  );
}
