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
