import { Pool, type PoolClient } from "pg";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createResource, createUser, resetDatabase } from "./helpers";

// Group A (plan 6.2): the exclusion constraint on its own. Everything here is
// plain SQL through the pg driver, so no application code can be what makes
// these pass.

const EXCLUSION_VIOLATION = "23P01";
const DEADLOCK_DETECTED = "40P01";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// A fixed day far in the future. The constraint compares instants, so the
// timezone of these values is irrelevant here.
const at = (time: string) => new Date(`2030-01-15T${time}:00Z`);

type Queryable = Pool | PoolClient;

type NewReservation = {
  resourceId: string;
  userId: string;
  start: Date;
  end: Date;
};

async function insertConfirmed(
  queryable: Queryable,
  reservation: NewReservation,
): Promise<string> {
  const result = await queryable.query<{ id: string }>(
    `insert into reservations (resource_id, user_id, title, start_at, end_at)
     values ($1, $2, 'Test booking', $3, $4)
     returning id`,
    [
      reservation.resourceId,
      reservation.userId,
      reservation.start,
      reservation.end,
    ],
  );

  return result.rows[0].id;
}

async function cancel(id: string, cancelledBy: string): Promise<void> {
  await pool.query(
    `update reservations
     set status = 'cancelled', cancelled_at = now(), cancelled_by = $2
     where id = $1`,
    [id, cancelledBy],
  );
}

async function countConfirmed(resourceId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `select count(*) as count from reservations
     where resource_id = $1 and status = 'confirmed'`,
    [resourceId],
  );

  return Number(result.rows[0].count);
}

describe("reservations_no_overlap constraint", () => {
  let resourceId: string;
  let userId: string;

  beforeEach(async () => {
    await resetDatabase();
    resourceId = (await createResource()).id;
    userId = (await createUser()).id;
  });

  afterAll(async () => {
    await pool.end();
  });

  const booking = (start: string, end: string): NewReservation => ({
    resourceId,
    userId,
    start: at(start),
    end: at(end),
  });

  it("rejects an identical range on the same resource", async () => {
    await insertConfirmed(pool, booking("09:00", "10:00"));

    await expect(
      insertConfirmed(pool, booking("09:00", "10:00")),
    ).rejects.toMatchObject({
      code: EXCLUSION_VIOLATION,
      constraint: "reservations_no_overlap",
    });
  });

  it.each([
    ["partial overlap at the end", "09:30", "10:30"],
    ["partial overlap at the start", "08:30", "09:30"],
    ["a range containing the existing one", "08:00", "11:00"],
    ["a range contained in the existing one", "09:15", "09:45"],
  ])("rejects %s", async (_label, start, end) => {
    await insertConfirmed(pool, booking("09:00", "10:00"));

    await expect(
      insertConfirmed(pool, booking(start, end)),
    ).rejects.toMatchObject({ code: EXCLUSION_VIOLATION });
  });

  it("accepts back-to-back reservations (BR9)", async () => {
    await insertConfirmed(pool, booking("09:00", "10:00"));
    await insertConfirmed(pool, booking("10:00", "11:00"));

    expect(await countConfirmed(resourceId)).toBe(2);
  });

  it("accepts the same range on a different resource (BR11)", async () => {
    const otherResourceId = (await createResource()).id;

    await insertConfirmed(pool, booking("09:00", "10:00"));
    await insertConfirmed(pool, {
      ...booking("09:00", "10:00"),
      resourceId: otherResourceId,
    });

    expect(await countConfirmed(otherResourceId)).toBe(1);
  });

  it("ignores cancelled reservations (BR10)", async () => {
    const id = await insertConfirmed(pool, booking("09:00", "10:00"));
    await cancel(id, userId);

    await insertConfirmed(pool, booking("09:30", "10:30"));

    expect(await countConfirmed(resourceId)).toBe(1);
  });

  it("allows rebooking the exact range after a cancellation", async () => {
    const id = await insertConfirmed(pool, booking("09:00", "10:00"));
    await cancel(id, userId);

    await insertConfirmed(pool, booking("09:00", "10:00"));

    expect(await countConfirmed(resourceId)).toBe(1);
  });

  it("rejects an update that moves a reservation into a conflict and leaves the row unchanged", async () => {
    await insertConfirmed(pool, booking("09:00", "10:00"));
    const id = await insertConfirmed(pool, booking("11:00", "12:00"));

    await expect(
      pool.query(
        `update reservations set start_at = $2, end_at = $3 where id = $1`,
        [id, at("09:30"), at("10:30")],
      ),
    ).rejects.toMatchObject({ code: EXCLUSION_VIOLATION });

    const row = await pool.query<{ start_at: Date; end_at: Date }>(
      `select start_at, end_at from reservations where id = $1`,
      [id],
    );
    expect(row.rows[0].start_at).toEqual(at("11:00"));
    expect(row.rows[0].end_at).toEqual(at("12:00"));
  });

  it("lets exactly one of two concurrent transactions book the same slot", async () => {
    const first = await pool.connect();
    const second = await pool.connect();

    try {
      await first.query("begin");
      await second.query("begin");

      // Both inserts are sent before either transaction commits. Neither can
      // see the other's uncommitted row, which is exactly the race an
      // application-level "check then insert" loses.
      const results = await Promise.allSettled(
        [first, second].map(async (client) => {
          try {
            await insertConfirmed(client, booking("14:00", "15:00"));
            await client.query("commit");
          } catch (error) {
            await client.query("rollback");
            throw error;
          }
        }),
      );

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter(
        (r): r is PromiseRejectedResult => r.status === "rejected",
      );

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      expect([EXCLUSION_VIOLATION, DEADLOCK_DETECTED]).toContain(
        (rejected[0].reason as { code?: string }).code,
      );
      expect(await countConfirmed(resourceId)).toBe(1);
    } finally {
      first.release();
      second.release();
    }
  });
});
