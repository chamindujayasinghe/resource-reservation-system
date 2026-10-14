import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import {
  CLOSING_TIME,
  OPENING_TIME,
  ORGANIZATION_TIME_ZONE,
  SLOT_MINUTES,
} from "./config";

// All conversion between wall-clock time in the organization's zone and UTC
// instants happens here. Nothing calls timezone-dependent Date methods, so
// results are the same on any server and in any browser.

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

// True for a real calendar date in YYYY-MM-DD form: "2026-02-30" is false.
export function isValidCalendarDate(date: string): boolean {
  if (
    !DATE_PATTERN.test(date) ||
    Number.isNaN(Date.parse(`${date}T00:00:00Z`))
  ) {
    return false;
  }
  // Some impossible dates parse by rolling over (Feb 30 -> Mar 2), so the
  // date must survive a round trip unchanged.
  return addCalendarDays(date, 0) === date;
}

// True for a 24-hour HH:mm time such as "09:30".
export function isValidTime(time: string): boolean {
  return TIME_PATTERN.test(time);
}

// "09:30" -> 570. Lets times on the same day be compared as numbers.
export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

// 570 -> "09:30".
export function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// Every slot boundary from opening to closing, inclusive:
// ["07:00", "07:30", ..., "20:00"].
export function slotTimes(): string[] {
  const times: string[] = [];
  for (
    let minutes = timeToMinutes(OPENING_TIME);
    minutes <= timeToMinutes(CLOSING_TIME);
    minutes += SLOT_MINUTES
  ) {
    times.push(minutesToTime(minutes));
  }
  return times;
}

// The UTC instants at which a calendar day in the zone begins and ends.
// Used to fetch "everything on this day" whatever the server's own zone.
export function dayBoundsUtc(
  date: string,
  timeZone: string = ORGANIZATION_TIME_ZONE,
): { start: Date; end: Date } {
  return {
    start: wallTimeToUtc(date, "00:00", timeZone),
    end: wallTimeToUtc(addCalendarDays(date, 1), "00:00", timeZone),
  };
}

// An instant as wall-clock HH:mm in the zone, for display.
export function formatTime(
  instant: Date,
  timeZone: string = ORGANIZATION_TIME_ZONE,
): string {
  return formatInTimeZone(instant, timeZone, "HH:mm");
}

// A calendar date for display: "Tue 13 Oct 2026". Midday is used so the
// conversion can never land on a neighbouring day.
export function formatCalendarDate(
  date: string,
  timeZone: string = ORGANIZATION_TIME_ZONE,
): string {
  return formatInTimeZone(
    wallTimeToUtc(date, "12:00", timeZone),
    timeZone,
    "EEE d MMM yyyy",
  );
}
