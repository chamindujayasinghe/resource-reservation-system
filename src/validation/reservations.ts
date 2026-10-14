import { z } from "zod";

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
