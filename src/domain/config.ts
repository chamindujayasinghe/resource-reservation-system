// Organization-wide settings. Business configuration lives here, not in the
// environment, because it is part of how the application behaves.

// Every time is entered and displayed in this zone, whatever the timezone of
// the server or the viewer's device (scope assumption 19).
export const ORGANIZATION_TIME_ZONE = "Asia/Colombo";

// Operating hours, every day of the week (scope assumption 20, BR6).
// Times are wall-clock HH:mm in the organization's time zone.
export const OPENING_TIME = "07:00";
export const CLOSING_TIME = "20:00";

// Reservations start and end on these boundaries (BR3).
export const SLOT_MINUTES = 30;

// BR4 and BR5.
export const MIN_DURATION_MINUTES = 30;
export const MAX_DURATION_MINUTES = 8 * 60;

// BR7: how far ahead a reservation may start, in calendar days.
export const MAX_ADVANCE_DAYS = 60;

// Upper bound for a resource's capacity (BR14) and a reservation's attendee
// count (BR16): a larger group could never fit anyway.
export const MAX_CAPACITY = 10_000;
