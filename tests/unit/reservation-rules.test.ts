import { describe, expect, it } from "vitest";

import {
  checkAttendeeCount,
  checkReservationTimes,
  hasStarted,
  type ReservationTimesInput,
} from "@/domain/reservation-rules";
import { addCalendarDays, wallTimeToUtc } from "@/domain/time";

// Fixed clock: 08:00 in Colombo on Wednesday 14 October 2026.
const TODAY = "2026-10-14";
const NOW = wallTimeToUtc(TODAY, "08:00");

function check(start: string, end: string, date = TODAY, now = NOW) {
  return checkReservationTimes({ date, start, end }, now);
}

function violationOf(result: ReturnType<typeof check>) {
  return result.ok ? undefined : result.violation;
}

describe("checkReservationTimes", () => {
  it("accepts a valid reservation and returns UTC instants", () => {
    const result = check("09:00", "10:00");

    expect(result).toEqual({
      ok: true,
      startAt: new Date("2026-10-14T03:30:00Z"),
      endAt: new Date("2026-10-14T04:30:00Z"),
    });
  });

  describe("BR1: end after start", () => {
    it.each([
      ["before", "10:00", "09:00"],
      ["equal to", "10:00", "10:00"],
    ])("rejects an end %s the start", (_label, start, end) => {
      expect(violationOf(check(start, end))).toMatchObject({ field: "end" });
    });
  });

  describe("BR2: not in the past", () => {
    it("rejects a start one minute in the past", () => {
      const oneMinuteLate = wallTimeToUtc(TODAY, "09:01");

      expect(
        violationOf(check("09:00", "10:00", TODAY, oneMinuteLate)),
      ).toMatchObject({ field: "start" });
    });

    it("accepts a start exactly now", () => {
      const exactlyNine = wallTimeToUtc(TODAY, "09:00");

      expect(check("09:00", "10:00", TODAY, exactlyNine).ok).toBe(true);
    });

    it("rejects yesterday", () => {
      expect(
        violationOf(check("09:00", "10:00", addCalendarDays(TODAY, -1))),
      ).toMatchObject({ field: "start" });
    });
  });

  describe("BR3: 30-minute boundaries", () => {
    it("rejects a start at 09:15", () => {
      expect(violationOf(check("09:15", "10:00"))).toMatchObject({
        field: "start",
      });
    });

    it("accepts a start at 09:30", () => {
      expect(check("09:30", "10:30").ok).toBe(true);
    });

    it("rejects an end at 10:15", () => {
      expect(violationOf(check("09:00", "10:15"))).toMatchObject({
        field: "end",
      });
    });
  });

  describe("BR4 and BR5: duration", () => {
    it("accepts 30 minutes", () => {
      expect(check("09:00", "09:30").ok).toBe(true);
    });

    it("accepts exactly 8 hours", () => {
      expect(check("09:00", "17:00").ok).toBe(true);
    });

    it("rejects 8.5 hours", () => {
      expect(violationOf(check("09:00", "17:30"))).toMatchObject({
        field: "end",
        message: "A reservation can be at most 8 hours long.",
      });
    });
  });

  describe("BR6: operating hours", () => {
    it("rejects a start at 06:30", () => {
      expect(
        violationOf(check("06:30", "08:00", addCalendarDays(TODAY, 1))),
      ).toMatchObject({ field: "start" });
    });

    it("accepts a start at 07:00", () => {
      expect(check("07:00", "08:00", addCalendarDays(TODAY, 1)).ok).toBe(true);
    });

    it("accepts an end at exactly 20:00", () => {
      expect(check("19:00", "20:00").ok).toBe(true);
    });

    it("rejects an end at 20:30", () => {
      expect(violationOf(check("19:30", "20:30"))).toMatchObject({
        field: "end",
      });
    });
  });

  describe("BR7: at most 60 days ahead", () => {
    it("accepts 60 days ahead", () => {
      expect(check("09:00", "10:00", addCalendarDays(TODAY, 60)).ok).toBe(true);
    });

    it("rejects 61 days ahead", () => {
      expect(
        violationOf(check("09:00", "10:00", addCalendarDays(TODAY, 61))),
      ).toMatchObject({ field: "date" });
    });
  });

  describe("malformed input", () => {
    it.each<[string, ReservationTimesInput, string]>([
      [
        "an impossible date",
        { date: "2026-02-30", start: "09:00", end: "10:00" },
        "date",
      ],
      [
        "a non-date",
        { date: "tomorrow", start: "09:00", end: "10:00" },
        "date",
      ],
      [
        "an impossible start",
        { date: TODAY, start: "25:00", end: "10:00" },
        "start",
      ],
      ["a non-time end", { date: TODAY, start: "09:00", end: "10am" }, "end"],
    ])("rejects %s", (_label, input, field) => {
      expect(violationOf(checkReservationTimes(input, NOW))).toMatchObject({
        field,
      });
    });
  });
});

describe("checkAttendeeCount (BR16)", () => {
  it("rejects more attendees than the capacity", () => {
    expect(checkAttendeeCount(13, 12)).toBe(
      "This resource holds at most 12 people.",
    );
  });

  it("accepts attendees equal to the capacity", () => {
    expect(checkAttendeeCount(12, 12)).toBeNull();
  });

  it("accepts any count when the resource has no capacity", () => {
    expect(checkAttendeeCount(500, null)).toBeNull();
  });

  it("accepts a reservation that states no count", () => {
    expect(checkAttendeeCount(null, 12)).toBeNull();
  });
});

describe("hasStarted (BR22)", () => {
  it("treats a reservation starting now as started", () => {
    expect(hasStarted(NOW, NOW)).toBe(true);
  });

  it("treats a later start as not started", () => {
    expect(hasStarted(wallTimeToUtc(TODAY, "08:30"), NOW)).toBe(false);
  });
});
