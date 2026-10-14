import { describe, expect, it } from "vitest";

import { buildDaySegments } from "@/domain/schedule";
import { wallTimeToUtc } from "@/domain/time";

const DATE = "2030-01-15";
const at = (time: string) => wallTimeToUtc(DATE, time);
const EARLY_MORNING = wallTimeToUtc(DATE, "06:00");

const booking = (title: string, start: string, end: string) => ({
  title,
  startAt: at(start),
  endAt: at(end),
});

describe("buildDaySegments", () => {
  it("shows an empty day as 26 free half-hour slots from 07:00 to 20:00", () => {
    const segments = buildDaySegments(DATE, [], EARLY_MORNING);

    expect(segments).toHaveLength(26);
    expect(segments[0]).toEqual({
      kind: "free",
      start: "07:00",
      end: "07:30",
      isPast: false,
    });
    expect(segments.at(-1)).toMatchObject({ start: "19:30", end: "20:00" });
  });

  it("shows each booking as one segment and keeps back-to-back bookings separate", () => {
    const planning = booking("Planning", "09:00", "10:00");
    const sync = booking("Sync", "10:00", "11:30");

    const segments = buildDaySegments(DATE, [planning, sync], EARLY_MORNING);
    const booked = segments.filter((s) => s.kind === "booked");

    expect(booked).toEqual([
      { kind: "booked", start: "09:00", end: "10:00", booking: planning },
      { kind: "booked", start: "10:00", end: "11:30", booking: sync },
    ]);
    // 26 slots, minus the 5 covered by bookings, plus the 2 booking rows.
    expect(segments).toHaveLength(23);
  });

  it("marks free slots that have already begun as past", () => {
    const segments = buildDaySegments(DATE, [], at("09:10"));

    expect(segments.find((s) => s.start === "09:00")).toMatchObject({
      isPast: true,
    });
    expect(segments.find((s) => s.start === "09:30")).toMatchObject({
      isPast: false,
    });
  });
});
