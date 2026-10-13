import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import { ORGANIZATION_TIME_ZONE } from "./config";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// The instant at which clocks in the zone show the given date and time.
// wallTimeToUtc("2026-10-13", "09:00") is 03:30 UTC for Asia/Colombo.
export function wallTimeToUtc(
  date: string,
  time: string,
  timeZone: string = ORGANIZATION_TIME_ZONE,
): Date {
  return fromZonedTime(`${date}T${time}:00`, timeZone);
}

// The calendar date (YYYY-MM-DD) that the zone's clocks show at an instant.
export function calendarDateOf(
  instant: Date,
  timeZone: string = ORGANIZATION_TIME_ZONE,
): string {
  return formatInTimeZone(instant, timeZone, "yyyy-MM-dd");
}

// Pure calendar arithmetic on a YYYY-MM-DD string; no timezone is involved.
export function addCalendarDays(date: string, days: number): string {
  const shifted = new Date(Date.parse(`${date}T00:00:00Z`) + days * MS_PER_DAY);
  return shifted.toISOString().slice(0, 10);
}
