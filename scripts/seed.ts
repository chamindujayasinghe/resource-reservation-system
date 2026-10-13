import { hash } from "bcryptjs";

import { addCalendarDays, calendarDateOf, wallTimeToUtc } from "@/domain/time";
import { db } from "@/server/db/client";
import { reservations, resources, users } from "@/server/db/schema";

// Demo data for local development (plan 8.4). Safe to run repeatedly: it
// clears the tables first. All dates are relative to the day it runs.

const DEMO_PASSWORD = "Password123!";
const BCRYPT_ROUNDS = 10;

type UserKey = "admin" | "sanduni" | "kasun" | "fathima" | "dinesh";

const SEED_USERS: Record<
  UserKey,
  { name: string; email: string; role: "admin" | "member" }
> = {
  admin: { name: "Nimal Perera", email: "admin@example.com", role: "admin" },
  sanduni: {
    name: "Sanduni Fernando",
    email: "sanduni@example.com",
    role: "member",
  },
  kasun: { name: "Kasun Silva", email: "kasun@example.com", role: "member" },
  fathima: {
    name: "Fathima Rizvi",
    email: "fathima@example.com",
    role: "member",
  },
  dinesh: { name: "Dinesh Kumar", email: "dinesh@example.com", role: "member" },
};

type ResourceKey =
  | "boardroom"
  | "roomA"
  | "roomB"
  | "roomC"
  | "trainingHall"
  | "projector"
  | "cameraKit"
  | "van"
  | "car";

const SEED_RESOURCES: Record<ResourceKey, typeof resources.$inferInsert> = {
  boardroom: {
    name: "Boardroom",
    type: "room",
    location: "Level 3",
    capacity: 14,
    description: "Video conferencing screen and whiteboard.",
  },
  roomA: {
    name: "Meeting Room A",
    type: "room",
    location: "Level 2",
    capacity: 6,
  },
  roomB: {
    name: "Meeting Room B",
    type: "room",
    location: "Level 2",
    capacity: 4,
  },
  trainingHall: {
    name: "Training Hall",
    type: "room",
    location: "Ground floor",
    capacity: 40,
    description: "Movable seating, two projectors.",
  },
  roomC: {
    name: "Meeting Room C",
    type: "room",
    location: "Level 1",
    capacity: 8,
    description: "Under renovation.",
    isActive: false,
  },
  projector: {
    name: "Epson Projector 1",
    type: "equipment",
    location: "IT store, Level 1",
  },
  cameraKit: {
    name: "Conference Camera Kit",
    type: "equipment",
    location: "IT store, Level 1",
  },
  van: {
    name: "Toyota HiAce Van",
    type: "vehicle",
    location: "Basement car park",
    capacity: 10,
  },
  car: {
    name: "Company Car (Toyota Axio)",
    type: "vehicle",
    location: "Basement car park",
    capacity: 4,
  },
};

type SeedReservation = {
  resource: ResourceKey;
  owner: UserKey;
  // Days from today in the organization's time zone; negative is the past.
  day: number;
  start: string;
  end: string;
  title: string;
  attendees?: number;
  cancelled?: { by: UserKey; reason?: string };
};

// One row per line reads as a table, so Prettier is told to leave it alone.
// prettier-ignore
const SEED_RESERVATIONS: SeedReservation[] = [
  // Past week: history for "My reservations" and the admin list.
  { resource: "boardroom", owner: "sanduni", day: -6, start: "09:00", end: "10:30", title: "Quarterly review prep", attendees: 8 },
  { resource: "roomA", owner: "kasun", day: -5, start: "13:00", end: "14:00", title: "Design sync", attendees: 4 },
  { resource: "roomB", owner: "fathima", day: -4, start: "10:00", end: "11:00", title: "One-to-one catch-up", attendees: 2 },
  { resource: "trainingHall", owner: "dinesh", day: -3, start: "09:00", end: "12:00", title: "Fire safety training", attendees: 30 },
  { resource: "projector", owner: "kasun", day: -3, start: "14:00", end: "16:00", title: "Product demo rehearsal" },
  { resource: "van", owner: "dinesh", day: -2, start: "08:00", end: "13:00", title: "Client site visit: Galle", attendees: 6 },
  { resource: "roomA", owner: "sanduni", day: -1, start: "15:00", end: "16:00", title: "Sprint retrospective", attendees: 5 },

  // Today. The first two are back-to-back, which BR9 allows.
  { resource: "roomA", owner: "sanduni", day: 0, start: "09:00", end: "10:00", title: "Daily planning", attendees: 4 },
  { resource: "roomA", owner: "kasun", day: 0, start: "10:00", end: "11:00", title: "Backend sync", attendees: 5 },
  { resource: "roomA", owner: "fathima", day: 0, start: "14:00", end: "15:30", title: "Vendor call", attendees: 3 },
  { resource: "boardroom", owner: "dinesh", day: 0, start: "11:00", end: "12:30", title: "Leadership weekly", attendees: 10 },
  { resource: "boardroom", owner: "admin", day: 0, start: "15:00", end: "16:00", title: "Facilities walkthrough", attendees: 4 },
  { resource: "projector", owner: "fathima", day: 0, start: "14:00", end: "15:30", title: "Vendor call slides" },

  // Next seven days. The Boardroom has several, ready for the deactivation demo.
  { resource: "boardroom", owner: "sanduni", day: 1, start: "09:00", end: "11:00", title: "Sprint planning", attendees: 12 },
  { resource: "boardroom", owner: "kasun", day: 1, start: "14:00", end: "15:00", title: "Client demo: Acme", attendees: 8 },
  { resource: "roomB", owner: "fathima", day: 1, start: "10:00", end: "12:00", title: "Interview panel", attendees: 4 },
  { resource: "trainingHall", owner: "dinesh", day: 2, start: "09:00", end: "13:00", title: "New joiner induction", attendees: 25 },
  { resource: "roomA", owner: "dinesh", day: 2, start: "13:00", end: "14:00", title: "Budget review", attendees: 6 },
  { resource: "van", owner: "kasun", day: 3, start: "07:00", end: "15:00", title: "Site visit to Kandy", attendees: 8 },
  { resource: "cameraKit", owner: "sanduni", day: 3, start: "10:00", end: "11:30", title: "Webinar recording" },
  { resource: "boardroom", owner: "fathima", day: 4, start: "10:00", end: "11:30", title: "Board pre-read", attendees: 9 },
  { resource: "car", owner: "sanduni", day: 5, start: "09:00", end: "12:00", title: "Bank visit", attendees: 2 },

  // Cancelled: one by its owner, one by the admin with a reason.
  { resource: "roomB", owner: "kasun", day: 2, start: "15:00", end: "16:00", title: "Team lunch planning", cancelled: { by: "kasun" } },
  { resource: "roomA", owner: "fathima", day: 3, start: "09:00", end: "10:00", title: "Workshop dry run", cancelled: { by: "admin", reason: "Room needed for an urgent client meeting" } },

  // Meeting Room C is inactive; its bookings were cancelled by the deactivation.
  { resource: "roomC", owner: "dinesh", day: 2, start: "10:00", end: "11:00", title: "Project kickoff", cancelled: { by: "admin", reason: "Resource deactivated" } },
  { resource: "roomC", owner: "sanduni", day: 4, start: "14:00", end: "15:00", title: "Design review", cancelled: { by: "admin", reason: "Resource deactivated" } },
];

async function seed(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Refusing to seed: NODE_ENV is production.");
  }

  const now = new Date();
  const today = calendarDateOf(now);
  const passwordHash = await hash(DEMO_PASSWORD, BCRYPT_ROUNDS);

  await db.transaction(async (tx) => {
    await tx.delete(reservations);
    await tx.delete(resources);
    await tx.delete(users);

    const userIds = new Map<UserKey, string>();
    for (const key of Object.keys(SEED_USERS) as UserKey[]) {
      const [row] = await tx
        .insert(users)
        .values({ ...SEED_USERS[key], passwordHash })
        .returning({ id: users.id });
      userIds.set(key, row.id);
    }

    const resourceIds = new Map<ResourceKey, string>();
    for (const key of Object.keys(SEED_RESOURCES) as ResourceKey[]) {
      const [row] = await tx
        .insert(resources)
        .values(SEED_RESOURCES[key])
        .returning({ id: resources.id });
      resourceIds.set(key, row.id);
    }

    const idOf = <Key>(ids: Map<Key, string>, key: Key): string => {
      const id = ids.get(key);
      if (!id) {
        throw new Error(`Seed data refers to an unknown key: ${String(key)}`);
      }
      return id;
    };

    await tx.insert(reservations).values(
      SEED_RESERVATIONS.map((item) => {
        const date = addCalendarDays(today, item.day);

        return {
          resourceId: idOf(resourceIds, item.resource),
          userId: idOf(userIds, item.owner),
          title: item.title,
          attendeeCount: item.attendees,
          startAt: wallTimeToUtc(date, item.start),
          endAt: wallTimeToUtc(date, item.end),
          ...(item.cancelled
            ? {
                status: "cancelled" as const,
                cancelledAt: now,
                cancelledBy: idOf(userIds, item.cancelled.by),
                cancellationReason: item.cancelled.reason,
              }
            : {}),
        };
      }),
    );
  });

  console.log(
    `Seeded ${Object.keys(SEED_USERS).length} users, ` +
      `${Object.keys(SEED_RESOURCES).length} resources and ` +
      `${SEED_RESERVATIONS.length} reservations (today is ${today}).`,
  );
  console.log(`\nDemo accounts (password for all: ${DEMO_PASSWORD})`);
  for (const user of Object.values(SEED_USERS)) {
    console.log(`  ${user.role.padEnd(6)}  ${user.email}`);
  }
}

seed()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => db.$client.end());
