import {
  CLOSING_TIME,
  MAX_ADVANCE_DAYS,
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  OPENING_TIME,
  SLOT_MINUTES,
} from "./config";
import {
  addCalendarDays,
  calendarDateOf,
  formatCalendarDate,
  isValidCalendarDate,
  isValidTime,
  timeToMinutes,
  wallTimeToUtc,
} from "./time";

// The time rules for a reservation (scope section 6, BR1 to BR7). Pure: the
// current time is a parameter, so every rule can be tested with a fixed clock.
// Used by both create and edit, so each rule is written once.

// What the user chose: a calendar date and wall-clock times in the
// organization's time zone.
export type ReservationTimesInput = {
  date: string;
  start: string;
  end: string;
};

export type RuleViolation = {
  field: "date" | "start" | "end";
  message: string;
};

export type ReservationTimesCheck =
  | { ok: true; startAt: Date; endAt: Date }
  | { ok: false; violation: RuleViolation };

const fail = (
  field: RuleViolation["field"],
  message: string,
): ReservationTimesCheck => ({ ok: false, violation: { field, message } });

export function checkReservationTimes(
  input: ReservationTimesInput,
  now: Date,
): ReservationTimesCheck {
  if (!isValidCalendarDate(input.date)) {
    return fail("date", "Choose a valid date.");
  }
  if (!isValidTime(input.start)) {
    return fail("start", "Choose a valid start time.");
  }
  if (!isValidTime(input.end)) {
    return fail("end", "Choose a valid end time.");
  }

  const startMinutes = timeToMinutes(input.start);
  const endMinutes = timeToMinutes(input.end);
  const duration = endMinutes - startMinutes;

  // BR3
  if (startMinutes % SLOT_MINUTES !== 0) {
    return fail(
      "start",
      `Start time must be on a ${SLOT_MINUTES}-minute boundary, such as 09:00 or 09:30.`,
    );
  }
  if (endMinutes % SLOT_MINUTES !== 0) {
    return fail(
      "end",
      `End time must be on a ${SLOT_MINUTES}-minute boundary, such as 10:00 or 10:30.`,
    );
  }

  // BR1
  if (duration <= 0) {
    return fail("end", "End time must be after the start time.");
  }

  // BR4 and BR5
  if (duration < MIN_DURATION_MINUTES) {
    return fail(
      "end",
      `A reservation must be at least ${MIN_DURATION_MINUTES} minutes long.`,
    );
  }
  if (duration > MAX_DURATION_MINUTES) {
    return fail(
      "end",
      `A reservation can be at most ${MAX_DURATION_MINUTES / 60} hours long.`,
    );
  }

  // BR6. Start and end share one date, so the reservation is on one day.
  if (startMinutes < timeToMinutes(OPENING_TIME)) {
    return fail("start", `Reservations can start from ${OPENING_TIME}.`);
  }
  if (endMinutes > timeToMinutes(CLOSING_TIME)) {
    return fail("end", `Reservations must end by ${CLOSING_TIME}.`);
  }

  const startAt = wallTimeToUtc(input.date, input.start);
  const endAt = wallTimeToUtc(input.date, input.end);

  // BR2. The server's clock decides, never the browser's.
  if (startAt.getTime() < now.getTime()) {
    return fail(
      "start",
      "This time has already passed. Choose a later start time.",
    );
  }

  // BR7. YYYY-MM-DD strings compare correctly as text.
  const latestDate = addCalendarDays(calendarDateOf(now), MAX_ADVANCE_DAYS);
  if (input.date > latestDate) {
    return fail(
      "date",
      `Reservations can be made at most ${MAX_ADVANCE_DAYS} days ahead, so up to ${formatCalendarDate(latestDate)}.`,
    );
  }

  return { ok: true, startAt, endAt };
}

// BR16 (S2): the group must fit. Nothing to check when no count was given
// or the resource has no capacity. Returns the message to show, or null.
export function checkAttendeeCount(
  attendeeCount: number | null,
  capacity: number | null,
): string | null {
  if (attendeeCount === null || capacity === null) {
    return null;
  }
  return attendeeCount > capacity
    ? `This resource holds at most ${capacity} people.`
    : null;
}

// BR22: a reservation can be changed or cancelled only before it starts.
export function hasStarted(startAt: Date, now: Date): boolean {
  return startAt.getTime() <= now.getTime();
}
