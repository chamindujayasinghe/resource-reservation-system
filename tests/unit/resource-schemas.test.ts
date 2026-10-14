import { describe, expect, it } from "vitest";

import {
  resourceFiltersSchema,
  resourceIdSchema,
  resourceInputSchema,
} from "@/validation/resources";

const validForm = {
  name: "  Meeting Room A  ",
  type: "room",
  location: "Level 2",
  capacity: "6",
  description: "Whiteboard and screen.",
};

function fieldErrorOf(input: Record<string, string>, field: string) {
  const result = resourceInputSchema.safeParse(input);
  expect(result.success).toBe(false);
  return result.error?.issues.find((issue) => issue.path[0] === field)?.message;
}

describe("resourceInputSchema", () => {
  it("accepts a valid form, trims text and converts capacity to a number", () => {
    expect(resourceInputSchema.parse(validForm)).toEqual({
      name: "Meeting Room A",
      type: "room",
      location: "Level 2",
      capacity: 6,
      description: "Whiteboard and screen.",
    });
  });

  it("stores an empty capacity and a blank description as null", () => {
    const parsed = resourceInputSchema.parse({
      ...validForm,
      capacity: "",
      description: "   ",
    });

    expect(parsed.capacity).toBeNull();
    expect(parsed.description).toBeNull();
  });

  it.each(["0", "-3", "2.5", "six", "10001"])(
    "rejects capacity %s (BR14)",
    (capacity) => {
      expect(
        fieldErrorOf({ ...validForm, capacity }, "capacity"),
      ).toBeDefined();
    },
  );

  it("rejects a whitespace-only name", () => {
    expect(fieldErrorOf({ ...validForm, name: "   " }, "name")).toBe(
      "Enter a name.",
    );
  });

  it("rejects a name over 100 characters", () => {
    expect(
      fieldErrorOf({ ...validForm, name: "x".repeat(101) }, "name"),
    ).toBeDefined();
  });

  it("rejects an unknown type", () => {
    expect(fieldErrorOf({ ...validForm, type: "spaceship" }, "type")).toBe(
      "Choose a type.",
    );
  });
});

describe("resourceFiltersSchema", () => {
  it("keeps a valid type and search term", () => {
    expect(
      resourceFiltersSchema.parse({ type: "vehicle", q: " van " }),
    ).toEqual({ type: "vehicle", q: "van" });
  });

  it("drops an unknown type, an empty search and repeated parameters", () => {
    expect(resourceFiltersSchema.parse({ type: "spaceship", q: "" })).toEqual({
      type: undefined,
      q: undefined,
    });
    expect(
      resourceFiltersSchema.parse({ type: ["room", "vehicle"], q: ["a", "b"] }),
    ).toEqual({ type: undefined, q: undefined });
  });
});

describe("resourceIdSchema", () => {
  it("accepts a UUID and rejects anything else", () => {
    expect(
      resourceIdSchema.safeParse("2f1c7f58-6a0e-4a5e-9a3b-0c2d1e4f5a6b")
        .success,
    ).toBe(true);
    expect(resourceIdSchema.safeParse("123").success).toBe(false);
    expect(resourceIdSchema.safeParse("' or 1=1 --").success).toBe(false);
  });
});
