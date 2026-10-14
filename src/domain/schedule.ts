import { CLOSING_TIME, OPENING_TIME, SLOT_MINUTES } from "./config";
import { minutesToTime, timeToMinutes, wallTimeToUtc } from "./time";

// One row of a resource's day schedule: a whole booking, or one free slot.
export type ScheduleSegment<Booking> =
  | { kind: "free"; start: string; end: string; isPast: boolean }
  | { kind: "booked"; start: string; end: string; booking: Booking };

const MS_PER_MINUTE = 60 * 1000;

// Walks the operating day slot by slot. A booking becomes a single segment
// spanning its whole time; each free slot becomes its own segment, marked as
// past once it has begun (it can no longer be booked, BR2).
export function buildDaySegments<
  Booking extends { startAt: Date; endAt: Date },
>(
  date: string,
  bookings: readonly Booking[],
  now: Date,
): ScheduleSegment<Booking>[] {
  const closingMinute = timeToMinutes(CLOSING_TIME);
  const instantOf = (minute: number) =>
    wallTimeToUtc(date, minutesToTime(minute)).getTime();

  const segments: ScheduleSegment<Booking>[] = [];
  let minute = timeToMinutes(OPENING_TIME);

  while (minute < closingMinute) {
    const at = instantOf(minute);
    const booking = bookings.find(
      (b) => b.startAt.getTime() <= at && at < b.endAt.getTime(),
    );

    if (booking) {
      const remainingSlots = Math.ceil(
        (booking.endAt.getTime() - at) / MS_PER_MINUTE / SLOT_MINUTES,
      );
      const endMinute = Math.min(
        closingMinute,
        minute + remainingSlots * SLOT_MINUTES,
      );
      segments.push({
        kind: "booked",
        start: minutesToTime(minute),
        end: minutesToTime(endMinute),
        booking,
      });
      minute = endMinute;
    } else {
      segments.push({
        kind: "free",
        start: minutesToTime(minute),
        end: minutesToTime(minute + SLOT_MINUTES),
        isPast: at < now.getTime(),
      });
      minute += SLOT_MINUTES;
    }
  }

  return segments;
}
