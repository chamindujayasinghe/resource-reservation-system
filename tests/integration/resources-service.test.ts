import { randomUUID } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import type { UserRole } from "@/server/db/schema";
import {
  createResource,
  getResource,
  listResources,
  updateResource,
} from "@/server/services/resources";
import type { AuthenticatedUser } from "@/server/services/users";
import type { ResourceInput } from "@/validation/resources";

import * as fixtures from "./helpers";

async function createActor(role: UserRole): Promise<AuthenticatedUser> {
  const user = await fixtures.createUser({ role });
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

const input = (overrides: Partial<ResourceInput> = {}): ResourceInput => ({
  name: "Meeting Room A",
  type: "room",
  location: "Level 2",
  capacity: 6,
  description: null,
  ...overrides,
});

describe("resource service", () => {
  let admin: AuthenticatedUser;
  let member: AuthenticatedUser;

  beforeEach(async () => {
    await fixtures.resetDatabase();
    admin = await createActor("admin");
    member = await createActor("member");
  });

  describe("authorization (M2)", () => {
    it("refuses a member creating a resource", async () => {
      await expect(createResource(member, input())).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      expect(await listResources(admin, { includeInactive: true })).toEqual([]);
    });

    it("refuses a member editing a resource and leaves it unchanged", async () => {
      const resource = await createResource(admin, input());

      await expect(
        updateResource(member, resource.id, input({ name: "Hijacked" })),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect((await getResource(admin, resource.id))?.name).toBe(
        "Meeting Room A",
      );
    });
  });

  describe("create and update (M3)", () => {
    it("creates an active resource", async () => {
      const resource = await createResource(admin, input());

      expect(resource).toMatchObject({
        name: "Meeting Room A",
        isActive: true,
      });
    });

    it("rejects a duplicate name in different case as a name field error (BR13)", async () => {
      await createResource(admin, input({ name: "Boardroom" }));

      await expect(
        createResource(admin, input({ name: "BOARDROOM" })),
      ).rejects.toMatchObject({ code: "VALIDATION", field: "name" });
    });

    it("rejects renaming onto another resource's name", async () => {
      await createResource(admin, input({ name: "Boardroom" }));
      const other = await createResource(admin, input({ name: "Room B" }));

      await expect(
        updateResource(admin, other.id, input({ name: "boardroom" })),
      ).rejects.toMatchObject({ code: "VALIDATION", field: "name" });
    });

    it("allows changing the capitalisation of a resource's own name", async () => {
      const resource = await createResource(
        admin,
        input({ name: "boardroom" }),
      );

      const updated = await updateResource(
        admin,
        resource.id,
        input({ name: "Boardroom" }),
      );

      expect(updated.name).toBe("Boardroom");
    });

    it("reports NOT_FOUND when updating a resource that does not exist", async () => {
      await expect(
        updateResource(admin, randomUUID(), input()),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });
  });

  describe("listing and visibility (M5)", () => {
    beforeEach(async () => {
      await fixtures.createResource({ name: "Boardroom", type: "room" });
      await fixtures.createResource({ name: "Toyota Van", type: "vehicle" });
      await fixtures.createResource({ name: "50% Room", type: "room" });
      await fixtures.createResource({
        name: "Room C",
        type: "room",
        isActive: false,
      });
    });

    const names = (list: { name: string }[]) => list.map((r) => r.name);

    it("hides inactive resources from members, even when they ask for them", async () => {
      expect(names(await listResources(member))).not.toContain("Room C");
      expect(
        names(await listResources(member, { includeInactive: true })),
      ).not.toContain("Room C");
    });

    it("shows inactive resources to admins who ask for them", async () => {
      expect(names(await listResources(admin))).not.toContain("Room C");
      expect(
        names(await listResources(admin, { includeInactive: true })),
      ).toContain("Room C");
    });

    it("filters by type and sorts by name", async () => {
      expect(names(await listResources(member, { type: "room" }))).toEqual([
        "50% Room",
        "Boardroom",
      ]);
    });

    it("searches names case-insensitively, treating % literally", async () => {
      expect(names(await listResources(member, { q: "BOARD" }))).toEqual([
        "Boardroom",
      ]);
      expect(names(await listResources(member, { q: "50%" }))).toEqual([
        "50% Room",
      ]);
      expect(names(await listResources(member, { q: "%" }))).toEqual([
        "50% Room",
      ]);
    });

    it("returns null from getResource for an inactive resource, for members only", async () => {
      const [roomC] = await listResources(admin, {
        includeInactive: true,
        q: "Room C",
      });

      expect(await getResource(member, roomC.id)).toBeNull();
      expect((await getResource(admin, roomC.id))?.name).toBe("Room C");
    });
  });
});
