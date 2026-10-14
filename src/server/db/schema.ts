import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// Every time column is timestamptz: an unambiguous instant, stored in UTC.
const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const userRole = pgEnum("user_role", ["admin", "member"]);
export type UserRole = (typeof userRole.enumValues)[number];

export const resourceType = pgEnum("resource_type", [
  "room",
  "equipment",
  "vehicle",
  "other",
]);
export type ResourceType = (typeof resourceType.enumValues)[number];

export const reservationStatus = pgEnum("reservation_status", [
  "confirmed",
  "cancelled",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    email: text("email").notNull().unique("users_email_unique"),
    passwordHash: text("password_hash").notNull(),
    role: userRole("role").notNull().default("member"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (table) => [
    check("users_email_lowercase", sql`${table.email} = lower(${table.email})`),
  ],
);

export const resources = pgTable(
  "resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    type: resourceType("type").notNull(),
    location: text("location").notNull(),
    capacity: integer("capacity"),
    description: text("description"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    // BR13: names are unique ignoring case.
    uniqueIndex("resources_name_unique").on(sql`lower(${table.name})`),
    check(
      "resources_name_length",
      sql`char_length(${table.name}) between 1 and 100`,
    ),
    // BR14: capacity is optional, but positive when present.
    check("resources_capacity_positive", sql`${table.capacity} > 0`),
  ],
);

export const reservations = pgTable(
  "reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // BR17: a resource with reservations can never be deleted.
    resourceId: uuid("resource_id")
      .notNull()
      .references(() => resources.id, { onDelete: "restrict" }),
    // BR19: exactly one owner, the user who created it.
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    title: text("title").notNull(),
    attendeeCount: integer("attendee_count"),
    startAt: timestamptz("start_at").notNull(),
    endAt: timestamptz("end_at").notNull(),
    status: reservationStatus("status").notNull().default("confirmed"),
    cancelledAt: timestamptz("cancelled_at"),
    cancelledBy: uuid("cancelled_by").references(() => users.id, {
      onDelete: "restrict",
    }),
    cancellationReason: text("cancellation_reason"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("reservations_resource_start_idx").on(
      table.resourceId,
      table.startAt,
    ),
    index("reservations_user_start_idx").on(table.userId, table.startAt),
    index("reservations_start_idx").on(table.startAt),
    // BR20
    check(
      "reservations_title_length",
      sql`char_length(${table.title}) between 3 and 100`,
    ),
    check(
      "reservations_attendee_count_positive",
      sql`${table.attendeeCount} > 0`,
    ),
    // BR1
    check(
      "reservations_end_after_start",
      sql`${table.endAt} > ${table.startAt}`,
    ),
    // BR26: who and when are recorded if and only if the row is cancelled.
    check(
      "reservations_cancellation_consistent",
      sql`(${table.status} = 'cancelled' and ${table.cancelledAt} is not null and ${table.cancelledBy} is not null) or (${table.status} = 'confirmed' and ${table.cancelledAt} is null and ${table.cancelledBy} is null)`,
    ),
  ],
);

// BR8 to BR10 (no overlapping confirmed reservations) are enforced by the
// exclusion constraint reservations_no_overlap. Drizzle cannot declare it, so
// it lives in a hand-written SQL migration in drizzle/.
