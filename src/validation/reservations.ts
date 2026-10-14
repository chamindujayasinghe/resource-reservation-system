import { z } from "zod";

import { MAX_CAPACITY } from "@/domain/config";
import { isValidCalendarDate } from "@/domain/time";

// The booking form. Shape only: whether the date and times satisfy the
// booking rules (BR1 to BR7) is decided by checkReservationTimes, so each
// rule is written once.
export const reservationInputSchema = z.object({
  date: z.string().trim().min(1, "Choose a date."),
  start: z.string().trim().min(1, "Choose a start time."),
  end: z.string().trim().min(1, "Choose an end time."),
  // BR20
  title: z
    .string()
    .trim()
    .min(3, "Describe the purpose in at least 3 characters.")
    .max(100, "Use 100 characters or fewer."),
  // S2: optional. Whether the group fits the resource (BR16) is checked by
  // the service against the capacity at the moment of booking.
  attendeeCount: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || /^\d+$/.test(value),
      "Enter a whole number, or leave it empty.",
    )
    .transform((value) => (value === "" ? null : Number(value)))
    .refine(
      (value) => value === null || (value >= 1 && value <= MAX_CAPACITY),
      `Enter a number between 1 and ${MAX_CAPACITY.toLocaleString("en")}.`,
    ),
});

export type ReservationInput = z.output<typeof reservationInputSchema>;

// ?date= on a resource's schedule. Anything that is not a real calendar date
// is dropped, and the page shows today instead.
export const scheduleSearchSchema = z.object({
  date: z.string().refine(isValidCalendarDate).optional().catch(undefined),
});

export const reservationIdSchema = z.uuid();

// ?resource=&status=&from=&to= on the admin reservation list (M10). Each
// invalid value is dropped on its own; the page supplies the default range.
export const adminReservationFiltersSchema = z.object({
  resource: z.uuid().optional().catch(undefined),
  status: z.enum(["confirmed", "cancelled"]).optional().catch(undefined),
  from: z.string().refine(isValidCalendarDate).optional().catch(undefined),
  to: z.string().refine(isValidCalendarDate).optional().catch(undefined),
});

export type AdminReservationFilters = z.output<
  typeof adminReservationFiltersSchema
>;

// May be empty: whether a reason is required depends on who is cancelling
// whose reservation (BR23), which the service decides.
export const cancellationReasonSchema = z
  .string()
  .trim()
  .max(200, "Use 200 characters or fewer.")
  .refine(
    (reason) => reason === "" || reason.length >= 3,
    "Use at least 3 characters.",
  );
