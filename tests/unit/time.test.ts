import { afterEach, describe, expect, it } from "vitest";

import {
  addCalendarDays,
  calendarDateOf,
  dayBoundsUtc,
  formatCalendarDate,
  formatTime,
  isValidCalendarDate,
  minutesToTime,
  slotTimes,
  timeToMinutes,
  wallTimeToUtc,
} from "@/domain/time";

describe("Colombo wall time and UTC", () => {
  it("converts 09:00 in Colombo to 03:30 UTC", () => {
    expect(wallTimeToUtc("2026-10-14", "09:00").toISOString()).toBe(
      "2026-10-14T03:30:00.000Z",
    );
  });

  it("keeps 07:00 Colombo on the same Colombo day", () => {
    const instant = wallTimeToUtc("2026-10-14", "07:00");

    expect(instant.toISOString()).toBe("2026-10-14T01:30:00.000Z");
    expect(calendarDateOf(instant)).toBe("2026-10-14");
  });

  it("puts 00:30 Colombo on the Colombo day, although it is the previous UTC day", () => {
    const instant = wallTimeToUtc("2026-10-14", "00:30");

    expect(instant.toISOString()).toBe("2026-10-13T19:00:00.000Z");
    expect(calendarDateOf(instant)).toBe("2026-10-14");
  });

  it("formats an instant as Colombo time", () => {
    expect(formatTime(new Date("2026-10-14T03:30:00Z"))).toBe("09:00");
  });

  it("gives the UTC bounds of a Colombo day", () => {
    expect(dayBoundsUtc("2026-10-14")).toEqual({
      start: new Date("2026-10-13T18:30:00Z"),
      end: new Date("2026-10-14T18:30:00Z"),
    });
  });

  describe("with the server process in another timezone", () => {
    const originalTimeZone = process.env.TZ;

    afterEach(() => {
      process.env.TZ = originalTimeZone;
    });

    it("gives identical results", () => {
      process.env.TZ = "America/Los_Angeles";

      expect(wallTimeToUtc("2026-10-14", "09:00").toISOString()).toBe(
        "2026-10-14T03:30:00.000Z",
      );
      expect(calendarDateOf(new Date("2026-10-13T19:00:00Z"))).toBe(
        "2026-10-14",
      );
      expect(formatTime(new Date("2026-10-14T03:30:00Z"))).toBe("09:00");
      expect(formatCalendarDate("2026-10-14")).toBe("Wed 14 Oct 2026");
    });
  });
});

describe("calendar dates", () => {
  it("adds days across month and year ends", () => {
    expect(addCalendarDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addCalendarDays("2026-10-14", -14)).toBe("2026-09-30");
  });

  it("recognises real dates only", () => {
    expect(isValidCalendarDate("2028-02-29")).toBe(true);
    expect(isValidCalendarDate("2026-02-29")).toBe(false);
    expect(isValidCalendarDate("2026-13-01")).toBe(false);
    expect(isValidCalendarDate("14/10/2026")).toBe(false);
  });

  it("formats a date for display", () => {
    expect(formatCalendarDate("2026-10-13")).toBe("Tue 13 Oct 2026");
  });
});

describe("slot times", () => {
  it("converts between HH:mm and minutes", () => {
    expect(timeToMinutes("09:30")).toBe(570);
    expect(minutesToTime(570)).toBe("09:30");
  });

  it("lists every boundary from opening to closing", () => {
    const slots = slotTimes();

    expect(slots[0]).toBe("07:00");
    expect(slots.at(-1)).toBe("20:00");
    expect(slots).toHaveLength(27);
  });
});
